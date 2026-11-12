import { describe, expect, test } from '@jest/globals';
import { newDb } from 'pg-mem';

import { initializeDatabase } from '../../src/database.js';
import { AppError } from '../../src/errors.js';
import {
  createBudget,
  createBudgetPeriod,
  createCategory,
  createCommitment,
  createIncomeSource,
  createJar,
  createRolloverRecord,
  createUser,
  getActiveBudgetPeriod,
  getAuditEvent,
  getBudget,
  getBudgetPeriod,
  getCategory,
  getCommitment,
  getCurrentPeriodJarSummary,
  getExpense,
  getIncomeEntry,
  getIncomeSource,
  getJar,
  getJarAllocation,
  getRolloverRecord,
  getUser,
  getUserActiveBudget,
  listAuditEventsForEntity,
  listAuditHistoryForUser,
  listBudgetPeriods,
  listBudgetsForUser,
  listCategoriesForUser,
  listCommitments,
  listExpenses,
  listIncomeEntries,
  listIncomeSources,
  listJarAllocations,
  listJars,
  listPeriodJarSummaries,
  listRolloverRecords,
  recordAuditEvent,
  recordExpense,
  recordIncomeEntry,
  RepositoryError,
  saveJarAllocation,
} from '../../src/repositories/budgeting/index.js';

const USER_1 = '00000000-0000-0000-0000-000000000001';
const USER_2 = '00000000-0000-0000-0000-000000000002';
const MISSING_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const BUDGET_1 = '10000000-0000-0000-0000-000000000001';
const BUDGET_2 = '10000000-0000-0000-0000-000000000002';
const PERIOD_1 = '20000000-0000-0000-0000-000000000001';
const PERIOD_2 = '20000000-0000-0000-0000-000000000002';
const CATEGORY_1 = '30000000-0000-0000-0000-000000000001';
const JAR_1 = '40000000-0000-0000-0000-000000000001';
const INCOME_SOURCE_1 = '50000000-0000-0000-0000-000000000001';
const INCOME_ENTRY_1 = '60000000-0000-0000-0000-000000000001';
const EXPENSE_1 = '70000000-0000-0000-0000-000000000001';
const COMMITMENT_1 = '80000000-0000-0000-0000-000000000001';
const AUDIT_1 = '90000000-0000-0000-0000-000000000001';
const ROLLOVER_1 = 'a0000000-0000-0000-0000-000000000001';
const SUMMARY_1 = 'b0000000-0000-0000-0000-000000000001';

const createTestPool = async () => {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await initializeDatabase(pool, { postgresFeatures: false });
  return pool;
};

const seedUserAndBudget = async () => {
  const pool = await createTestPool();
  await createUser(pool, {
    id: USER_1,
    authSubject: 'auth-1',
    displayName: 'User One',
  });
  const budget = await createBudget(pool, {
    id: BUDGET_1,
    userId: USER_1,
    name: 'Monthly',
    periodType: 'monthly',
    timezone: 'Africa/Lagos',
  });
  return { pool, budget };
};

const seedPeriodAndJar = async () => {
  const { pool, budget } = await seedUserAndBudget();
  const period = await createBudgetPeriod(pool, {
    id: PERIOD_1,
    budgetId: budget.id,
    userId: USER_1,
    sequence: 1,
    startsOn: '2026-11-01',
    endsOn: '2026-11-30',
    timezone: 'Africa/Lagos',
    status: 'active',
    openingUnallocatedKobo: 50_000n,
  });
  const category = await createCategory(pool, {
    id: CATEGORY_1,
    userId: USER_1,
    name: 'Food',
  });
  const jar = await createJar(pool, {
    id: JAR_1,
    budgetId: budget.id,
    userId: USER_1,
    name: 'Food',
    kind: 'standard',
    rolloverPolicy: 'release_to_general_pool',
    categoryId: category.id,
    targetKobo: 20_000n,
  });
  return { pool, budget, period, category, jar };
};

describe('budgeting repositories', () => {
  test('creates and retrieves users, budgets, and the active budget', async () => {
    const { pool } = await seedUserAndBudget();

    await expect(getUser(pool, USER_1)).resolves.toMatchObject({
      id: USER_1,
      authSubject: 'auth-1',
      displayName: 'User One',
      currency: 'NGN',
    });

    const budget = await getBudget(pool, BUDGET_1);
    expect(budget).toMatchObject({
      id: BUDGET_1,
      userId: USER_1,
      status: 'active',
      periodType: 'monthly',
      version: 1,
    });

    await expect(getUserActiveBudget(pool, USER_1)).resolves.toMatchObject({
      id: BUDGET_1,
    });
    await expect(getUserActiveBudget(pool, USER_2)).resolves.toBeNull();
    await expect(listBudgetsForUser(pool, USER_1)).resolves.toHaveLength(1);
    await expect(getBudget(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);
  });

  test('creates and retrieves budget periods and finds the active period', async () => {
    const { pool, budget } = await seedUserAndBudget();

    const first = await createBudgetPeriod(pool, {
      id: PERIOD_1,
      budgetId: budget.id,
      userId: USER_1,
      sequence: 1,
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      timezone: 'Africa/Lagos',
      status: 'draft',
    });
    const second = await createBudgetPeriod(pool, {
      id: PERIOD_2,
      budgetId: budget.id,
      userId: USER_1,
      sequence: 2,
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
      timezone: 'Africa/Lagos',
      status: 'active',
      openingUnallocatedKobo: 25_000n,
    });

    expect(first.startsOn).toBe('2026-10-01');
    expect(second.openingUnallocatedKobo).toBe(25_000n);
    await expect(getBudgetPeriod(pool, PERIOD_1)).resolves.toMatchObject({
      status: 'draft',
    });
    await expect(getActiveBudgetPeriod(pool, budget.id)).resolves.toMatchObject({
      id: PERIOD_2,
    });
    const periods = await listBudgetPeriods(pool, budget.id);
    expect(periods.map(period => period.id)).toEqual([PERIOD_1, PERIOD_2]);
    await expect(getBudgetPeriod(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);
  });

  test('creates and retrieves jars and categories', async () => {
    const { pool, budget, category, jar } = await seedPeriodAndJar();

    await expect(getCategory(pool, category.id)).resolves.toMatchObject({
      name: 'Food',
      isSystem: false,
    });
    await expect(getJar(pool, jar.id)).resolves.toMatchObject({
      name: 'Food',
      kind: 'standard',
      targetKobo: 20_000n,
      categoryId: category.id,
    });

    const categories = await listCategoriesForUser(pool, USER_1);
    expect(categories.map(item => item.id)).toEqual([category.id]);

    const jars = await listJars(pool, budget.id);
    expect(jars.map(item => item.id)).toEqual([jar.id]);
    await expect(getJar(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);
  });

  test('saves an allocation, updates it in place, and reports invalid references', async () => {
    const { pool, budget, period, jar } = await seedPeriodAndJar();

    const created = await saveJarAllocation(pool, {
      userId: USER_1,
      budgetId: budget.id,
      periodId: period.id,
      jarId: jar.id,
      amountKobo: 5_000n,
    });
    expect(created).toMatchObject({ amountKobo: 5_000n, version: 1 });

    const updated = await saveJarAllocation(pool, {
      userId: USER_1,
      budgetId: budget.id,
      periodId: period.id,
      jarId: jar.id,
      amountKobo: 7_500n,
      note: 'Adjusted',
    });
    expect(updated.id).toBe(created.id);
    expect(updated.amountKobo).toBe(7_500n);
    expect(updated.version).toBe(2);
    expect(updated.note).toBe('Adjusted');

    await expect(
      getJarAllocation(pool, period.id, jar.id),
    ).resolves.toMatchObject({ amountKobo: 7_500n });
    await expect(listJarAllocations(pool, period.id)).resolves.toHaveLength(1);

    await expect(
      saveJarAllocation(pool, {
        userId: USER_1,
        budgetId: budget.id,
        periodId: period.id,
        jarId: MISSING_ID,
        amountKobo: 1_000n,
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  test('records and retrieves income sources and entries', async () => {
    const { pool, period } = await seedPeriodAndJar();

    const source = await createIncomeSource(pool, {
      id: INCOME_SOURCE_1,
      userId: USER_1,
      name: 'Salary',
      sourceType: 'salary',
    });
    await expect(getIncomeSource(pool, source.id)).resolves.toMatchObject({
      name: 'Salary',
      active: true,
    });
    await expect(
      listIncomeSources(pool, USER_1, { activeOnly: true }),
    ).resolves.toHaveLength(1);

    const entry = await recordIncomeEntry(pool, {
      id: INCOME_ENTRY_1,
      userId: USER_1,
      budgetPeriodId: period.id,
      incomeSourceId: source.id,
      amountKobo: 100_000n,
      status: 'received',
      receivedAt: '2026-11-01T09:00:00.000Z',
      note: 'Monthly salary',
    });

    expect(entry.amountKobo).toBe(100_000n);
    expect(entry.receivedAt).toBe('2026-11-01T09:00:00.000Z');
    await expect(getIncomeEntry(pool, entry.id)).resolves.toMatchObject({
      status: 'received',
      incomeSourceId: source.id,
    });
    await expect(listIncomeEntries(pool, period.id)).resolves.toHaveLength(1);
    await expect(getIncomeEntry(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);

    await expect(
      recordIncomeEntry(pool, {
        userId: USER_1,
        budgetPeriodId: MISSING_ID,
        amountKobo: 1_000n,
        status: 'expected',
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  test('records and retrieves expenses, including refund entries', async () => {
    const { pool, period, category, jar } = await seedPeriodAndJar();

    const expense = await recordExpense(pool, {
      id: EXPENSE_1,
      userId: USER_1,
      budgetPeriodId: period.id,
      categoryId: category.id,
      jarId: jar.id,
      amountKobo: 3_500n,
      merchant: 'Market',
      occurredAt: '2026-11-02T12:30:00.000Z',
    });

    expect(expense).toMatchObject({
      id: EXPENSE_1,
      amountKobo: 3_500n,
      entryType: 'expense',
      source: 'manual',
      categoryId: category.id,
      jarId: jar.id,
    });

    await expect(getExpense(pool, expense.id)).resolves.toMatchObject({
      merchant: 'Market',
    });
    await expect(listExpenses(pool, period.id)).resolves.toHaveLength(1);

    const refund = await recordExpense(pool, {
      userId: USER_1,
      budgetPeriodId: period.id,
      categoryId: category.id,
      jarId: jar.id,
      entryType: 'refund',
      adjustsExpenseId: expense.id,
      amountKobo: 500n,
      occurredAt: '2026-11-03T08:00:00.000Z',
    });
    expect(refund.entryType).toBe('refund');
    expect(refund.adjustsExpenseId).toBe(expense.id);

    await expect(getExpense(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);
    await expect(
      recordExpense(pool, {
        userId: USER_1,
        budgetPeriodId: period.id,
        categoryId: MISSING_ID,
        amountKobo: 1_000n,
        occurredAt: '2026-11-04T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  test('records and retrieves commitments', async () => {
    const { pool, period } = await seedPeriodAndJar();

    const commitment = await createCommitment(pool, {
      id: COMMITMENT_1,
      userId: USER_1,
      budgetPeriodId: period.id,
      name: 'Rent',
      amountKobo: 150_000n,
      dueOn: '2026-11-05',
    });

    expect(commitment).toMatchObject({
      id: COMMITMENT_1,
      amountKobo: 150_000n,
      dueOn: '2026-11-05',
      status: 'planned',
    });
    await expect(getCommitment(pool, commitment.id)).resolves.toMatchObject({
      name: 'Rent',
    });
    await expect(listCommitments(pool, period.id)).resolves.toHaveLength(1);
    await expect(getCommitment(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);
  });

  test('records audit history and retrieves it by entity and user', async () => {
    const { pool, budget } = await seedUserAndBudget();

    const event = await recordAuditEvent(pool, {
      id: AUDIT_1,
      userId: USER_1,
      actorType: 'user',
      actorId: USER_1,
      entityType: 'budget',
      entityId: budget.id,
      action: 'budget.created',
      beforeState: null,
      afterState: { name: 'Monthly' },
      reason: 'Initial budget',
      requestId: 'request-1',
      occurredAt: '2026-11-01T10:00:00.000Z',
    });

    expect(event.beforeState).toBeNull();
    expect(event.afterState).toEqual({ name: 'Monthly' });

    await expect(getAuditEvent(pool, event.id)).resolves.toMatchObject({
      action: 'budget.created',
    });
    await expect(
      listAuditEventsForEntity(pool, 'budget', budget.id),
    ).resolves.toHaveLength(1);
    await expect(listAuditHistoryForUser(pool, USER_1)).resolves.toHaveLength(1);
    await expect(getAuditEvent(pool, MISSING_ID)).rejects.toBeInstanceOf(AppError);

    await expect(
      recordAuditEvent(pool, {
        userId: USER_1,
        actorType: 'user',
        entityType: 'budget',
        entityId: budget.id,
        action: 'budget.invalid',
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  test('retrieves rollover records and period jar summaries', async () => {
    const { pool, budget, period, jar } = await seedPeriodAndJar();

    await pool.query(
      `INSERT INTO rollover_records (
         id, user_id, budget_id, period_id, scope, currency, revision, policy,
         closing_balance_kobo, carried_forward_kobo,
         released_to_general_pool_kobo, shortfall_kobo, created_by
       )
       VALUES ($1, $2, $3, $4, 'general_pool', 'NGN', 1, NULL,
               1000, 1000, 0, 0, $2)`,
      [ROLLOVER_1, USER_1, budget.id, period.id],
    );

    await expect(getRolloverRecord(pool, ROLLOVER_1)).resolves.toMatchObject({
      scope: 'general_pool',
      closingBalanceKobo: 1_000n,
      carriedForwardKobo: 1_000n,
    });
    await expect(listRolloverRecords(pool, period.id)).resolves.toHaveLength(1);

    // pg-mem silently omits rollover rows when these partial indexes are active.
    await pool.query(
      `DROP INDEX IF EXISTS rollover_records_jar_revision;
       DROP INDEX IF EXISTS rollover_records_general_revision;
       DROP INDEX IF EXISTS rollover_records_current_jar;
       DROP INDEX IF EXISTS rollover_records_current_general`,
    );
    await createRolloverRecord(pool, {
      userId: USER_1,
      budgetId: budget.id,
      periodId: period.id,
      jarId: jar.id,
      scope: 'jar',
      currency: 'NGN',
      revision: 1,
      policy: 'carry_forward',
      closingBalanceKobo: 1_000n,
      carriedForwardKobo: 1_000n,
      releasedToGeneralPoolKobo: 0n,
      shortfallKobo: 0n,
      nextPeriodId: period.id,
      createdBy: USER_1,
    });
    await expect(listRolloverRecords(pool, period.id)).resolves.toHaveLength(2);

    await pool.query(
      `INSERT INTO period_jar_summaries (
         id, user_id, budget_id, period_id, jar_id, currency, revision,
         opening_balance_kobo, allocated_kobo, spent_kobo, closing_balance_kobo,
         rollover_policy, carried_forward_kobo,
         released_to_general_pool_kobo, shortfall_kobo
       )
       VALUES ($1, $2, $3, $4, $5, 'NGN', 1,
               0, 1000, 200, 800, 'carry_forward', 800, 0, 0)`,
      [SUMMARY_1, USER_1, budget.id, period.id, jar.id],
    );

    await expect(
      getCurrentPeriodJarSummary(pool, period.id, jar.id),
    ).resolves.toMatchObject({ closingBalanceKobo: 800n });
    await expect(
      listPeriodJarSummaries(pool, period.id),
    ).resolves.toHaveLength(1);
  });
});
