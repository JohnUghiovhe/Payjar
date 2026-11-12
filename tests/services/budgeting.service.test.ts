import { describe, expect, test } from '@jest/globals';
import { newDb } from 'pg-mem';

import { initializeDatabase } from '../../src/database.js';
import type { Kobo } from '../../src/budgeting/money.js';
import {
  createCategory,
  createCommitment,
  createJar,
  createUser,
  getBudgetPeriod,
  getUserActiveBudget,
  listAuditEventsForEntity,
  listAuditHistoryForUser,
  listExpenses,
  listIncomeEntries,
  listBudgetsForUser,
  listPeriodJarSummaries,
  listRolloverRecords,
  listBudgetPeriods,
  RepositoryError,
} from '../../src/repositories/budgeting/index.js';
import { BudgetingService } from '../../src/services/budgeting.service.js';

const USER_1 = '00000000-0000-0000-0000-000000000001';
const USER_2 = '00000000-0000-0000-0000-000000000002';
const CATEGORY_1 = '30000000-0000-0000-0000-000000000001';
const JAR_STANDARD = '40000000-0000-0000-0000-000000000001';
const JAR_SAVINGS = '40000000-0000-0000-0000-000000000002';
let idempotencyCounter = 0;

const nextIdempotencyKey = (): string =>
  `budgeting-test-${++idempotencyCounter}`;

/**
 * pg-mem accepts BEGIN and ROLLBACK but does not undo writes. Wrap the pool so
 * a rollback restores a snapshot, which lets the tests verify that the service
 * leaves no partial state behind when a transaction fails.
 */
const createTransactionalPool = <PoolType extends object>(
  db: ReturnType<typeof newDb>,
  pool: PoolType,
  failOnRolloverInsert = false,
  failOnAuditInsert = false,
): PoolType => {
  const raw = pool as unknown as {
    query: (text: string, values?: unknown[]) => Promise<unknown>;
    connect: () => Promise<{
      query: (text: string, values?: unknown[]) => Promise<unknown>;
      release: () => void;
    }>;
  };

  let snapshot: ReturnType<typeof db.backup> | null = null;

  const wrapped = {
    query: (text: string, values?: unknown[]) => raw.query(text, values),
    connect: async () => {
      const client = await raw.connect();

      return {
        query: async (text: string, values?: unknown[]) => {
          const statement = text.trim().toUpperCase();
          if (failOnRolloverInsert && statement.startsWith('INSERT INTO ROLLOVER_RECORDS')) {
            throw new Error('Injected rollover persistence failure.');
          }
          if (failOnAuditInsert && statement.startsWith('INSERT INTO AUDIT_EVENTS')) {
            throw new Error('Injected audit persistence failure.');
          }

          if (statement === 'BEGIN') {
            snapshot = db.backup();
          } else if (statement === 'COMMIT') {
            snapshot = null;
          } else if (statement === 'ROLLBACK') {
            snapshot?.restore();
            snapshot = null;
          }

          return client.query(text, values);
        },
        release: () => client.release(),
      };
    },
  };

  return wrapped as unknown as PoolType;
};

const createTestContext = async (
  options: {
    failOnRolloverInsert?: boolean;
    failOnAuditInsert?: boolean;
  } = {},
) => {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await initializeDatabase(pool, { postgresFeatures: false });
  // pg-mem silently omits rollover rows when these partial indexes are active.
  await pool.query(
    `DROP INDEX IF EXISTS rollover_records_jar_revision;
     DROP INDEX IF EXISTS rollover_records_general_revision;
     DROP INDEX IF EXISTS rollover_records_current_jar;
     DROP INDEX IF EXISTS rollover_records_current_general`,
  );

  await createUser(pool, {
    id: USER_1,
    authSubject: 'auth-1',
    displayName: 'User One',
  });
  await createUser(pool, {
    id: USER_2,
    authSubject: 'auth-2',
    displayName: 'User Two',
  });

  const service = new BudgetingService(
    createTransactionalPool(
      db,
      pool,
      options.failOnRolloverInsert,
      options.failOnAuditInsert,
    ),
    () => new Date('2026-11-10T12:00:00.000Z'),
  );

  return { pool, service };
};

const createBudgetWithPeriod = async (
  service: BudgetingService,
  openingUnallocatedKobo: Kobo = 100_000n,
) =>
  service.createBudget({
    userId: USER_1,
    idempotencyKey: nextIdempotencyKey(),
    name: 'Monthly',
    periodType: 'monthly',
    timezone: 'Africa/Lagos',
    initialPeriod: {
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
      name: 'November',
      openingUnallocatedKobo,
    },
  });

const sum = (amounts: readonly Kobo[]): Kobo =>
  amounts.reduce((total, amount) => total + amount, 0n);

describe('BudgetingService', () => {
  test('closes, reopens, revises rollover, and activates the funded next period', async () => {
    const { pool, service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);
    await createCategory(pool, {
      id: CATEGORY_1,
      userId: USER_1,
      name: 'Food',
    });
    await createJar(pool, {
      id: JAR_STANDARD,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Food',
      kind: 'standard',
      rolloverPolicy: 'release_to_general_pool',
    });
    await createJar(pool, {
      id: JAR_SAVINGS,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Emergency',
      kind: 'savings',
      rolloverPolicy: 'carry_forward',
    });

    const active = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });
    await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: active.period.id,
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 30_000n, expectedVersion: 0 },
        { jarId: JAR_SAVINGS, amountKobo: 20_000n, expectedVersion: 0 },
      ],
    });
    await service.recordIncome({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: active.period.id,
      amountKobo: 10_000n,
      status: 'received',
      receivedAt: '2026-11-02T09:00:00.000Z',
    });
    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: active.period.id,
      categoryId: CATEGORY_1,
      amountKobo: 5_000n,
      occurredAt: '2026-11-03T09:00:00.000Z',
    });
    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: active.period.id,
      categoryId: CATEGORY_1,
      jarId: JAR_STANDARD,
      amountKobo: 10_000n,
      occurredAt: '2026-11-04T09:00:00.000Z',
    });
    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: active.period.id,
      categoryId: CATEGORY_1,
      jarId: JAR_SAVINGS,
      amountKobo: 25_000n,
      occurredAt: '2026-11-05T09:00:00.000Z',
    });

    const closeCommand = {
      userId: USER_1,
      actorId: USER_1,
      periodId: active.period.id,
      expectedVersion: active.period.version,
      nextPeriod: {
        startsOn: '2026-12-01',
        endsOn: '2026-12-31',
        name: 'December',
      },
    };
    const closed = await service.closeBudgetPeriod(closeCommand);

    expect(closed.period).toMatchObject({
      status: 'closed',
      closingUnallocatedKobo: 55_000n,
      totalIncomeKobo: 10_000n,
      totalExpenseKobo: 40_000n,
      totalAllocatedKobo: 50_000n,
      totalReleasedKobo: 20_000n,
      totalCarriedKobo: 50_000n,
      totalShortfallKobo: 5_000n,
    });
    expect(closed.nextPeriod).toMatchObject({
      status: 'draft',
      sequence: 2,
      openingUnallocatedKobo: 75_000n,
    });
    expect(closed.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jarId: JAR_STANDARD,
          closingBalanceKobo: 20_000n,
          carriedForwardKobo: 0n,
          releasedToGeneralPoolKobo: 20_000n,
        }),
        expect.objectContaining({
          jarId: JAR_SAVINGS,
          closingBalanceKobo: -5_000n,
          carriedForwardKobo: -5_000n,
          shortfallKobo: 5_000n,
        }),
      ]),
    );
    expect(closed.rollovers).toHaveLength(3);
    expect(closed.rollovers.map(item => [item.scope, item.jarId])).toEqual(
      expect.arrayContaining([
        ['jar', JAR_STANDARD],
        ['jar', JAR_SAVINGS],
        ['general_pool', null],
      ]),
    );

    await expect(
      service.closeBudgetPeriod(closeCommand),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      listPeriodJarSummaries(pool, active.period.id),
    ).resolves.toHaveLength(2);
    await expect(
      listRolloverRecords(pool, active.period.id),
    ).resolves.toHaveLength(3);

    const reopened = await service.reopenBudgetPeriod({
      userId: USER_1,
      actorId: USER_1,
      periodId: closed.period.id,
      expectedVersion: closed.period.version,
      reason: 'Correct a late expense',
    });
    expect(reopened).toMatchObject({
      status: 'active',
      closingUnallocatedKobo: null,
      reopenCount: 1,
    });
    const lateExpense = await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: reopened.id,
      categoryId: CATEGORY_1,
      amountKobo: 2_000n,
      occurredAt: '2026-11-06T09:00:00.000Z',
    });

    const revised = await service.closeBudgetPeriod({
      ...closeCommand,
      expectedVersion: reopened.version,
    });
    expect(revised.period.closingUnallocatedKobo).toBe(53_000n);
    expect(revised.nextPeriod.openingUnallocatedKobo).toBe(73_000n);
    expect(revised.summaries.every(summary => summary.revision === 2)).toBe(true);
    expect(revised.rollovers.every(rollover => rollover.revision === 2)).toBe(true);
    await expect(
      listPeriodJarSummaries(pool, active.period.id, {
        includeSuperseded: true,
      }),
    ).resolves.toHaveLength(4);
    await expect(
      listRolloverRecords(pool, active.period.id, {
        includeSuperseded: true,
      }),
    ).resolves.toHaveLength(6);

    const audit = await listAuditEventsForEntity(
      pool,
      'budget_period',
      active.period.id,
    );
    expect(audit.map(event => event.action)).toEqual(
      expect.arrayContaining([
        'budget_period.closed',
        'budget_period.reopened',
      ]),
    );
    expect(
      audit.find(event => event.action === 'budget_period.reopened')?.reason,
    ).toBe('Correct a late expense');
    const previousRollover = closed.rollovers[0]!;
    const rolloverReplacement = revised.rollovers.find(
      rollover =>
        rollover.scope === previousRollover.scope &&
        rollover.jarId === previousRollover.jarId,
    );
    const rolloverAudit = await listAuditEventsForEntity(
      pool,
      'rollover_record',
      previousRollover.id,
    );
    expect(rolloverAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'rollover.applied',
          afterState: expect.objectContaining({ id: previousRollover.id }),
        }),
        expect.objectContaining({
          action: 'rollover.superseded',
          beforeState: expect.objectContaining({ id: previousRollover.id }),
          afterState: expect.objectContaining({
            id: rolloverReplacement?.id,
          }),
        }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(pool, 'expense', lateExpense.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'expense.recorded' }),
      ]),
    );

    const activated = await service.activateBudgetPeriod({
      userId: USER_1,
      actorId: USER_1,
      periodId: revised.nextPeriod.id,
    });
    expect(activated.status).toBe('active');
    expect(activated.openingUnallocatedKobo).toBe(73_000n);
    await expect(
      listAuditEventsForEntity(pool, 'budget_period', activated.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'budget_period.activated' }),
      ]),
    );
    const nextState = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
      periodId: activated.id,
    });
    expect(
      nextState.jars.find(item => item.jar.id === JAR_SAVINGS)?.openingBalanceKobo,
    ).toBe(-5_000n);
    await expect(
      service.reopenBudgetPeriod({
        userId: USER_1,
        actorId: USER_1,
        periodId: active.period.id,
        expectedVersion: revised.period.version,
        reason: 'Too late to reopen',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rolls back a close when rollover persistence fails', async () => {
    const { pool, service } = await createTestContext({
      failOnRolloverInsert: true,
    });
    const budget = await createBudgetWithPeriod(service);
    const state = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });
    await createJar(pool, {
      id: JAR_STANDARD,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Food',
      kind: 'standard',
      rolloverPolicy: 'release_to_general_pool',
    });

    await expect(
      service.closeBudgetPeriod({
        userId: USER_1,
        actorId: USER_1,
        periodId: state.period.id,
        expectedVersion: state.period.version,
        nextPeriod: {
          startsOn: '2026-12-01',
          endsOn: '2026-12-31',
        },
      }),
    ).rejects.toBeInstanceOf(RepositoryError);

    await expect(getBudgetPeriod(pool, state.period.id)).resolves.toMatchObject({
      status: 'active',
      closingUnallocatedKobo: null,
    });
    await expect(listBudgetPeriods(pool, budget.id)).resolves.toHaveLength(1);
    await expect(
      listPeriodJarSummaries(pool, state.period.id, {
        includeSuperseded: true,
      }),
    ).resolves.toHaveLength(0);
    await expect(
      listRolloverRecords(pool, state.period.id, {
        includeSuperseded: true,
      }),
    ).resolves.toHaveLength(0);
    await expect(
      listAuditEventsForEntity(pool, 'budget_period', state.period.id),
    ).resolves.toEqual([
      expect.objectContaining({ action: 'budget_period.created' }),
    ]);
  });

  test('creates one active budget per user and allows a new one after archiving', async () => {
    const { pool, service } = await createTestContext();

    const budget = await createBudgetWithPeriod(service);
    expect(budget).toMatchObject({
      userId: USER_1,
      name: 'Monthly',
      status: 'active',
      version: 1,
    });

    await expect(createBudgetWithPeriod(service)).rejects.toMatchObject({
      statusCode: 409,
    });

    await expect(getUserActiveBudget(pool, USER_1)).resolves.toMatchObject({
      id: budget.id,
    });

    const archived = await service.updateBudget({
      userId: USER_1,
      budgetId: budget.id,
      expectedVersion: 1,
      status: 'archived',
    });
    expect(archived.status).toBe('archived');
    expect(archived.version).toBe(2);
    await expect(
      listAuditEventsForEntity(pool, 'budget', budget.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'budget.archived',
          beforeState: { status: 'active' },
          afterState: { status: 'archived' },
        }),
      ]),
    );

    const replacement = await createBudgetWithPeriod(service);
    expect(replacement.id).not.toBe(budget.id);
    await expect(getUserActiveBudget(pool, USER_1)).resolves.toMatchObject({
      id: replacement.id,
    });
  });

  test('audits budget, allocation, income, expense, and refund changes with snapshots', async () => {
    const { pool, service } = await createTestContext();
    const budget = await service.createBudget({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      requestId: 'budget-create-request',
      name: 'Monthly',
      periodType: 'monthly',
      timezone: 'Africa/Lagos',
      initialPeriod: {
        startsOn: '2026-11-01',
        endsOn: '2026-11-30',
        openingUnallocatedKobo: 100_000n,
      },
    });
    const period = (await listBudgetPeriods(pool, budget.id))[0];
    expect(period).toBeDefined();

    await service.updateBudget({
      userId: USER_1,
      budgetId: budget.id,
      expectedVersion: budget.version,
      requestId: 'budget-update-request',
      name: 'Updated monthly',
    });

    await createCategory(pool, {
      id: CATEGORY_1,
      userId: USER_1,
      name: 'Food',
    });
    await createJar(pool, {
      id: JAR_STANDARD,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Food',
      kind: 'standard',
      rolloverPolicy: 'release_to_general_pool',
    });

    const allocation = await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: period!.id,
      requestId: 'allocation-create-request',
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 10_000n, expectedVersion: 0 },
      ],
    });
    const updatedAllocation = await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: period!.id,
      requestId: 'allocation-update-request',
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 12_000n, expectedVersion: 1 },
      ],
    });
    const income = await service.recordIncome({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: period!.id,
      requestId: 'income-request',
      amountKobo: 5_000n,
      status: 'received',
      receivedAt: '2026-11-02T09:00:00.000Z',
    });
    const expense = await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: period!.id,
      categoryId: CATEGORY_1,
      requestId: 'expense-request',
      amountKobo: 2_000n,
      occurredAt: '2026-11-03T09:00:00.000Z',
    });
    const refund = await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: period!.id,
      categoryId: CATEGORY_1,
      entryType: 'refund',
      adjustsExpenseId: expense.id,
      requestId: 'refund-request',
      reason: 'Merchant refund',
      amountKobo: 500n,
      occurredAt: '2026-11-04T09:00:00.000Z',
    });

    await expect(
      listAuditEventsForEntity(pool, 'budget', budget.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'budget.created',
          requestId: 'budget-create-request',
          afterState: expect.objectContaining({ name: 'Monthly' }),
        }),
        expect.objectContaining({
          action: 'budget.updated',
          requestId: 'budget-update-request',
          beforeState: { name: 'Monthly' },
          afterState: { name: 'Updated monthly' },
        }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(pool, 'budget_period', period!.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'budget_period.created' }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(
        pool,
        'jar_allocation',
        allocation.allocations[0]!.id,
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'jar_allocation.created',
          requestId: 'allocation-create-request',
          beforeState: null,
        }),
        expect.objectContaining({
          action: 'jar_allocation.updated',
          requestId: 'allocation-update-request',
          beforeState: expect.objectContaining({ amountKobo: '10000' }),
          afterState: expect.objectContaining({ amountKobo: '12000' }),
        }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(pool, 'income_entry', income.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'income_entry.recorded',
          requestId: 'income-request',
          afterState: expect.objectContaining({ amountKobo: '5000' }),
        }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(pool, 'expense', expense.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'expense.recorded',
          requestId: 'expense-request',
          afterState: expect.objectContaining({ amountKobo: '2000' }),
        }),
      ]),
    );
    await expect(
      listAuditEventsForEntity(pool, 'expense', refund.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'expense.refunded',
          requestId: 'refund-request',
          reason: 'Merchant refund',
          afterState: expect.objectContaining({
            adjustsExpenseId: expense.id,
            amountKobo: '500',
          }),
        }),
      ]),
    );
    expect(updatedAllocation.allocations[0]?.amountKobo).toBe(12_000n);
  });

  test('rolls back a financial record when its required audit write fails', async () => {
    const { pool, service } = await createTestContext({
      failOnAuditInsert: true,
    });

    await expect(createBudgetWithPeriod(service)).rejects.toBeInstanceOf(
      RepositoryError,
    );
    await expect(listBudgetsForUser(pool, USER_1)).resolves.toHaveLength(0);
    await expect(listAuditHistoryForUser(pool, USER_1)).resolves.toHaveLength(0);
  });

  test('replays idempotent budget creates and rejects key reuse with another payload', async () => {
    const { pool, service } = await createTestContext();
    const command = {
      userId: USER_1,
      idempotencyKey: 'budget-create-retry',
      requestId: 'original-request',
      name: 'Monthly',
      periodType: 'monthly' as const,
      timezone: 'Africa/Lagos',
      initialPeriod: {
        startsOn: '2026-11-01',
        endsOn: '2026-11-30',
        openingUnallocatedKobo: 100_000n,
      },
    };

    const created = await service.createBudget(command);
    const replayed = await service.createBudget({
      ...command,
      requestId: 'retry-request',
    });

    expect(replayed.id).toBe(created.id);
    await expect(
      service.createBudget({ ...command, name: 'Different budget' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(listBudgetsForUser(pool, USER_1)).resolves.toHaveLength(1);
  });

  test('rejects stale budget updates instead of overwriting newer state', async () => {
    const { pool, service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);

    await expect(
      service.updateBudget({
        userId: USER_1,
        budgetId: budget.id,
        expectedVersion: 99,
        name: 'Stale update',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const updated = await service.updateBudget({
      userId: USER_1,
      budgetId: budget.id,
      expectedVersion: 1,
      name: 'Renamed',
    });
    expect(updated.name).toBe('Renamed');
    expect(updated.version).toBe(2);

    await expect(
      service.updateBudget({
        userId: USER_1,
        budgetId: budget.id,
        expectedVersion: 1,
        name: 'Overwrite',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(getUserActiveBudget(pool, USER_1)).resolves.toMatchObject({
      name: 'Renamed',
      version: 2,
    });
  });

  test('rolls back all writes when a multi-write budget creation fails', async () => {
    const { pool, service } = await createTestContext();
    const command = {
      userId: USER_1,
      idempotencyKey: 'budget-rollback-retry',
      name: 'Invalid period',
      periodType: 'monthly' as const,
      timezone: 'Africa/Lagos',
      initialPeriod: {
        startsOn: '2026-11-30',
        endsOn: '2026-11-01',
        openingUnallocatedKobo: 10_000n,
      },
    };

    await expect(
      service.createBudget(command),
    ).rejects.toBeInstanceOf(RepositoryError);

    await expect(getUserActiveBudget(pool, USER_1)).resolves.toBeNull();
    await expect(listBudgetsForUser(pool, USER_1)).resolves.toHaveLength(0);

    await expect(
      service.createBudget({
        ...command,
        initialPeriod: {
          ...command.initialPeriod,
          startsOn: '2026-11-01',
          endsOn: '2026-11-30',
        },
      }),
    ).resolves.toMatchObject({ name: 'Invalid period' });
  });

  test('builds budget state from stored records through the calculation engine', async () => {
    const { pool, service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);

    await createCategory(pool, {
      id: CATEGORY_1,
      userId: USER_1,
      name: 'Food',
    });
    await createJar(pool, {
      id: JAR_STANDARD,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Food',
      kind: 'standard',
      rolloverPolicy: 'release_to_general_pool',
      categoryId: CATEGORY_1,
    });
    await createJar(pool, {
      id: JAR_SAVINGS,
      budgetId: budget.id,
      userId: USER_1,
      name: 'Emergency',
      kind: 'savings',
      rolloverPolicy: 'carry_forward',
    });

    const stateBeforeEntries = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
      currentDate: '2026-11-10',
    });

    const allocationResult = await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: stateBeforeEntries.period.id,
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 30_000n, expectedVersion: 0 },
        { jarId: JAR_SAVINGS, amountKobo: 20_000n, expectedVersion: 0 },
      ],
    });
    expect(allocationResult.funding).toMatchObject({
      availableFundsKobo: 100_000n,
      allocatedKobo: 50_000n,
      unallocatedFundsKobo: 50_000n,
      hasUnfundedAllocationWarning: false,
    });

    const incomeCommand = {
      userId: USER_1,
      idempotencyKey: 'income-retry',
      periodId: stateBeforeEntries.period.id,
      amountKobo: 50_000n,
      status: 'received',
      receivedAt: '2026-11-01T09:00:00.000Z',
    } as const;
    const income = await service.recordIncome(incomeCommand);
    const replayedIncome = await service.recordIncome(incomeCommand);
    expect(replayedIncome.id).toBe(income.id);
    await expect(listIncomeEntries(pool, stateBeforeEntries.period.id)).resolves.toHaveLength(1);

    const generalExpenseCommand = {
      userId: USER_1,
      idempotencyKey: 'expense-retry',
      periodId: stateBeforeEntries.period.id,
      categoryId: CATEGORY_1,
      amountKobo: 5_000n,
      occurredAt: '2026-11-02T10:00:00.000Z',
    } as const;
    const generalExpense = await service.recordExpense(generalExpenseCommand);
    const replayedExpense = await service.recordExpense(generalExpenseCommand);
    expect(replayedExpense.id).toBe(generalExpense.id);
    await expect(listExpenses(pool, stateBeforeEntries.period.id)).resolves.toHaveLength(1);

    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: stateBeforeEntries.period.id,
      categoryId: CATEGORY_1,
      jarId: JAR_STANDARD,
      amountKobo: 10_000n,
      occurredAt: '2026-11-03T10:00:00.000Z',
    });

    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: stateBeforeEntries.period.id,
      categoryId: CATEGORY_1,
      jarId: JAR_SAVINGS,
      amountKobo: 8_000n,
      occurredAt: '2026-11-04T10:00:00.000Z',
    });

    await service.recordExpense({
      userId: USER_1,
      idempotencyKey: nextIdempotencyKey(),
      periodId: stateBeforeEntries.period.id,
      categoryId: CATEGORY_1,
      entryType: 'refund',
      adjustsExpenseId: generalExpense.id,
      reason: 'Correct the original purchase amount.',
      amountKobo: 2_000n,
      occurredAt: '2026-11-05T10:00:00.000Z',
    });

    await createCommitment(pool, {
      userId: USER_1,
      budgetPeriodId: stateBeforeEntries.period.id,
      name: 'Rent',
      amountKobo: 15_000n,
      dueOn: '2026-11-20',
    });

    const state = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
      currentDate: '2026-11-10',
    });

    expect(state.asOfDate).toBe('2026-11-10');
    expect(state.inputs).toMatchObject({
      startingAvailableKobo: 100_000n,
      receivedIncomeKobo: 50_000n,
      periodExpensesKobo: 13_000n,
      unpaidCommitmentsKobo: 15_000n,
      protectedSavingsKobo: 20_000n,
      otherReservationsKobo: 0n,
    });
    expect(state.flexiblePool).toEqual({
      flexiblePoolKobo: 102_000n,
      isInShortfall: false,
      shortfallKobo: 0n,
    });
    expect(state.flexibleCapacityKobo).toBe(102_000n);
    expect(state.allocationFunding).toMatchObject({
      availableFundsKobo: 150_000n,
      allocatedKobo: 50_000n,
      unallocatedFundsKobo: 100_000n,
      hasUnfundedAllocationWarning: false,
    });

    const standardJar = state.jars.find(item => item.jar.id === JAR_STANDARD);
    const savingsJar = state.jars.find(item => item.jar.id === JAR_SAVINGS);

    expect(standardJar).toMatchObject({
      openingBalanceKobo: 0n,
      allocatedKobo: 30_000n,
      spentKobo: 10_000n,
      balanceKobo: 20_000n,
      isOverspent: false,
    });
    expect(savingsJar).toMatchObject({
      allocatedKobo: 20_000n,
      spentKobo: 8_000n,
      balanceKobo: 12_000n,
    });

    expect(state.dailyGuidance.status).toBe('active');
    expect(
      sum(state.dailyGuidance.dailyEntries.map(entry => entry.amountKobo)),
    ).toBe(102_000n);
    expect(
      sum(state.weeklyGuidance.map(entry => entry.amountKobo)),
    ).toBe(102_000n);
  });

  test('uses allocation versions to prevent stale concurrent writes', async () => {
    const { pool, service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);

    await createCategory(pool, {
      id: CATEGORY_1,
      userId: USER_1,
      name: 'Food',
    });
    for (const [id, name] of [
      [JAR_STANDARD, 'Food'],
      [JAR_SAVINGS, 'Emergency'],
    ] as const) {
      await createJar(pool, {
        id,
        budgetId: budget.id,
        userId: USER_1,
        name,
        kind: id === JAR_SAVINGS ? 'savings' : 'standard',
        rolloverPolicy:
          id === JAR_SAVINGS ? 'carry_forward' : 'release_to_general_pool',
      });
    }

    const state = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });

    const created = await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: state.period.id,
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 10_000n, expectedVersion: 0 },
      ],
    });
    expect(created.allocations[0]).toMatchObject({
      amountKobo: 10_000n,
      version: 1,
    });

    const updated = await service.saveJarAllocations({
      userId: USER_1,
      budgetId: budget.id,
      periodId: state.period.id,
      allocations: [
        { jarId: JAR_STANDARD, amountKobo: 15_000n, expectedVersion: 1 },
      ],
    });
    expect(updated.allocations[0]).toMatchObject({
      amountKobo: 15_000n,
      version: 2,
    });

    await expect(
      service.saveJarAllocations({
        userId: USER_1,
        budgetId: budget.id,
        periodId: state.period.id,
        allocations: [
          { jarId: JAR_STANDARD, amountKobo: 99_000n, expectedVersion: 1 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      service.saveJarAllocations({
        userId: USER_1,
        budgetId: budget.id,
        periodId: state.period.id,
        allocations: [
          { jarId: JAR_SAVINGS, amountKobo: 5_000n, expectedVersion: 0 },
        ],
      }),
    ).resolves.toBeDefined();

    const afterConflict = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });
    const standard = afterConflict.allocations.find(
      allocation => allocation.jarId === JAR_STANDARD,
    );
    expect(standard?.amountKobo).toBe(15_000n);
  });

  test('validates income and expense commands before writing', async () => {
    const { pool, service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);

    await createCategory(pool, {
      id: CATEGORY_1,
      userId: USER_1,
      name: 'Food',
    });
    await createCategory(pool, {
      id: '30000000-0000-0000-0000-000000000002',
      userId: USER_2,
      name: 'Other user category',
    });

    const state = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });

    await expect(
      service.recordIncome({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        amountKobo: 1_000n,
        status: 'received',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.recordExpense({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        categoryId: '30000000-0000-0000-0000-000000000002',
        amountKobo: 1_000n,
        occurredAt: '2026-11-02T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      service.recordExpense({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        categoryId: CATEGORY_1,
        entryType: 'refund',
        amountKobo: 1_000n,
        occurredAt: '2026-11-02T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.saveJarAllocations({
        userId: USER_1,
        budgetId: budget.id,
        periodId: state.period.id,
        allocations: [
          { jarId: JAR_STANDARD, amountKobo: 1_000n, expectedVersion: 0 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await pool.query(
      `UPDATE budget_periods
       SET status = 'closed',
           closing_unallocated_kobo = 0,
           total_income_kobo = 0,
           total_expense_kobo = 0,
           total_allocated_kobo = 0,
           total_released_kobo = 0,
           total_carried_kobo = 0,
           total_shortfall_kobo = 0,
           closed_at = now()
       WHERE id = $1`,
      [state.period.id],
    );

    await expect(
      service.recordIncome({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        amountKobo: 1_000n,
        status: 'expected',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      service.saveJarAllocations({
        userId: USER_1,
        budgetId: budget.id,
        periodId: state.period.id,
        allocations: [
          { jarId: JAR_STANDARD, amountKobo: 1_000n, expectedVersion: 0 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('blocks income and expense writes after a budget is archived', async () => {
    const { service } = await createTestContext();
    const budget = await createBudgetWithPeriod(service);
    const state = await service.getBudgetState({
      userId: USER_1,
      budgetId: budget.id,
    });

    await service.updateBudget({
      userId: USER_1,
      budgetId: budget.id,
      expectedVersion: 1,
      status: 'archived',
    });

    await expect(
      service.recordIncome({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        amountKobo: 1_000n,
        status: 'expected',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      service.recordExpense({
        userId: USER_1,
        idempotencyKey: nextIdempotencyKey(),
        periodId: state.period.id,
        categoryId: CATEGORY_1,
        amountKobo: 1_000n,
        occurredAt: '2026-11-02T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
