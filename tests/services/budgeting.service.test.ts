import { describe, expect, test } from '@jest/globals';
import { newDb } from 'pg-mem';

import { initializeDatabase } from '../../src/database.js';
import type { Kobo } from '../../src/budgeting/money.js';
import {
  createCategory,
  createCommitment,
  createJar,
  createUser,
  getUserActiveBudget,
  listExpenses,
  listIncomeEntries,
  listBudgetsForUser,
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

const createTestContext = async () => {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await initializeDatabase(pool, { postgresFeatures: false });

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
    createTransactionalPool(db, pool),
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

    const replacement = await createBudgetWithPeriod(service);
    expect(replacement.id).not.toBe(budget.id);
    await expect(getUserActiveBudget(pool, USER_1)).resolves.toMatchObject({
      id: replacement.id,
    });
  });

  test('replays idempotent budget creates and rejects key reuse with another payload', async () => {
    const { pool, service } = await createTestContext();
    const command = {
      userId: USER_1,
      idempotencyKey: 'budget-create-retry',
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
    const replayed = await service.createBudget(command);

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
