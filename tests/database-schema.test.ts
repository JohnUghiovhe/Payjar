import { describe, expect, test } from '@jest/globals';
import { newDb } from 'pg-mem';

import { initializeDatabase } from '../src/database.js';

const USER_1 = '00000000-0000-0000-0000-000000000001';
const USER_2 = '00000000-0000-0000-0000-000000000002';
const BUDGET_1 = '10000000-0000-0000-0000-000000000001';
const PERIOD_1 = '20000000-0000-0000-0000-000000000001';
const CATEGORY_1 = '30000000-0000-0000-0000-000000000001';
const JAR_1 = '40000000-0000-0000-0000-000000000001';

const createTestDatabase = async () => {
  const db = newDb();
  const pgAdapter = db.adapters.createPg();
  const pool = new pgAdapter.Pool();

  await initializeDatabase(pool);

  return pool;
};

const seedBudget = async (pool: Awaited<ReturnType<typeof createTestDatabase>>) => {
  await pool.query(
    `INSERT INTO users (id, auth_subject, display_name)
     VALUES ($1, 'auth-1', 'User One'), ($2, 'auth-2', 'User Two')`,
    [USER_1, USER_2],
  );
  await pool.query(
    `INSERT INTO budgets (id, user_id, name, period_type, timezone)
     VALUES ($1, $2, 'Monthly', 'monthly', 'Africa/Lagos')`,
    [BUDGET_1, USER_1],
  );
  await pool.query(
    `INSERT INTO budget_periods
       (id, budget_id, user_id, sequence, starts_on, ends_on, timezone, status)
     VALUES ($1, $2, $3, 1, '2026-11-01', '2026-11-30', 'Africa/Lagos', 'active')`,
    [PERIOD_1, BUDGET_1, USER_1],
  );
  await pool.query(
    `INSERT INTO categories (id, user_id, name) VALUES ($1, $2, 'Food')`,
    [CATEGORY_1, USER_1],
  );
  await pool.query(
    `INSERT INTO jars
       (id, budget_id, user_id, name, kind, rollover_policy)
     VALUES ($1, $2, $3, 'Food', 'standard', 'release_to_general_pool')`,
    [JAR_1, BUDGET_1, USER_1],
  );
};

const closePeriod = (
  pool: Awaited<ReturnType<typeof createTestDatabase>>,
  periodId: string,
) =>
  pool.query(
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
    [periodId],
  );

const BUDGETING_TABLES = [
  'users',
  'budgets',
  'budget_periods',
  'categories',
  'jars',
  'jar_allocations',
  'income_sources',
  'income_entries',
  'expenses',
  'commitments',
  'period_jar_summaries',
  'rollover_records',
  'audit_events',
];

describe('budgeting database schema', () => {
  test('creates every approved budgeting table', async () => {
    const pool = await createTestDatabase();

    for (const table of BUDGETING_TABLES) {
      await expect(pool.query(`SELECT * FROM ${table}`)).resolves.toBeDefined();
    }
  });

  test('rejects cross-user ownership references', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);

    await expect(
      pool.query(
        `INSERT INTO budget_periods
           (id, budget_id, user_id, sequence, starts_on, ends_on, timezone)
         VALUES ('20000000-0000-0000-0000-000000000002', $1, $2, 2, '2026-12-01', '2026-12-31', 'Africa/Lagos')`,
        [BUDGET_1, USER_2],
      ),
    ).rejects.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO jar_allocations
           (id, user_id, budget_id, period_id, jar_id, amount_kobo)
         VALUES ('60000000-0000-0000-0000-000000000001', $1, $2, $3, $4, 1000)`,
        [USER_2, BUDGET_1, PERIOD_1, JAR_1],
      ),
    ).rejects.toBeTruthy();
  });

  test('rejects invalid financial values and duplicate allocations', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);

    await expect(
      pool.query(
        `INSERT INTO jar_allocations
           (id, user_id, budget_id, period_id, jar_id, amount_kobo)
         VALUES ('60000000-0000-0000-0000-000000000001', $1, $2, $3, $4, -1)`,
        [USER_1, BUDGET_1, PERIOD_1, JAR_1],
      ),
    ).rejects.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO income_entries
           (id, user_id, budget_period_id, amount_kobo, status)
         VALUES ('70000000-0000-0000-0000-000000000001', $1, $2, 0, 'expected')`,
        [USER_1, PERIOD_1],
      ),
    ).rejects.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO expenses
           (id, user_id, budget_period_id, category_id, amount_kobo, occurred_at)
         VALUES ('50000000-0000-0000-0000-000000000001', $1, $2, $3, 0, now())`,
        [USER_1, PERIOD_1, CATEGORY_1],
      ),
    ).rejects.toBeTruthy();

    const allocationSql = `INSERT INTO jar_allocations
       (id, user_id, budget_id, period_id, jar_id, amount_kobo)
     VALUES ($1, $2, $3, $4, $5, 1000)`;

    await pool.query(allocationSql, [
      '60000000-0000-0000-0000-000000000002',
      USER_1,
      BUDGET_1,
      PERIOD_1,
      JAR_1,
    ]);

    await expect(
      pool.query(allocationSql, [
        '60000000-0000-0000-0000-000000000003',
        USER_1,
        BUDGET_1,
        PERIOD_1,
        JAR_1,
      ]),
    ).rejects.toBeTruthy();
  });

  test('requires a complete close snapshot before closing a period', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);

    await expect(
      pool.query(`UPDATE budget_periods SET status = 'closed' WHERE id = $1`, [
        PERIOD_1,
      ]),
    ).rejects.toBeTruthy();

    await expect(closePeriod(pool, PERIOD_1)).resolves.toBeDefined();
  });

  test('requires timestamps for received income and paid commitments', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);

    await expect(
      pool.query(
        `INSERT INTO income_entries
           (id, user_id, budget_period_id, amount_kobo, status)
         VALUES ('70000000-0000-0000-0000-000000000001', $1, $2, 500, 'received')`,
        [USER_1, PERIOD_1],
      ),
    ).rejects.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO commitments
           (id, user_id, budget_period_id, name, amount_kobo, due_on, status)
         VALUES ('80000000-0000-0000-0000-000000000001', $1, $2, 'Rent', 1000, '2026-11-20', 'paid')`,
        [USER_1, PERIOD_1],
      ),
    ).rejects.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO income_entries
           (id, user_id, budget_period_id, amount_kobo, status, received_at)
         VALUES ('70000000-0000-0000-0000-000000000002', $1, $2, 500, 'received', now())`,
        [USER_1, PERIOD_1],
      ),
    ).resolves.toBeDefined();
  });

  test('requires refund links and consistent summary arithmetic', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);

    await expect(
      pool.query(
        `INSERT INTO expenses
           (id, user_id, budget_period_id, category_id, entry_type, amount_kobo, occurred_at)
         VALUES ('50000000-0000-0000-0000-000000000001', $1, $2, $3, 'refund', 10, now())`,
        [USER_1, PERIOD_1, CATEGORY_1],
      ),
    ).rejects.toBeTruthy();

    const summarySql = `INSERT INTO period_jar_summaries
       (id, user_id, budget_id, period_id, jar_id, opening_balance_kobo,
        allocated_kobo, spent_kobo, closing_balance_kobo, rollover_policy,
        carried_forward_kobo, released_to_general_pool_kobo, shortfall_kobo)
     VALUES ($1, $2, $3, $4, $5, 0, 1000, 0, 1000, 'release_to_general_pool',
             999, 1000, 0)`;

    await expect(
      pool.query(summarySql, [
        '90000000-0000-0000-0000-000000000001',
        USER_1,
        BUDGET_1,
        PERIOD_1,
        JAR_1,
      ]),
    ).rejects.toBeTruthy();
  });

  test('accepts close-time records after the period is closed', async () => {
    const pool = await createTestDatabase();
    await seedBudget(pool);
    await closePeriod(pool, PERIOD_1);

    await expect(
      pool.query(
        `INSERT INTO jar_allocations
           (id, user_id, budget_id, period_id, jar_id, amount_kobo)
         VALUES ('60000000-0000-0000-0000-000000000001', $1, $2, $3, $4, 1000)`,
        [USER_1, BUDGET_1, PERIOD_1, JAR_1],
      ),
    ).resolves.toBeDefined();

    await expect(
      pool.query(
        `INSERT INTO period_jar_summaries
           (id, user_id, budget_id, period_id, jar_id, opening_balance_kobo,
            allocated_kobo, spent_kobo, closing_balance_kobo, rollover_policy,
            carried_forward_kobo, released_to_general_pool_kobo, shortfall_kobo)
         VALUES ($1, $2, $3, $4, $5, 0, 1000, 0, 1000, 'release_to_general_pool',
                 0, 1000, 0)`,
        [
          '90000000-0000-0000-0000-000000000002',
          USER_1,
          BUDGET_1,
          PERIOD_1,
          JAR_1,
        ],
      ),
    ).resolves.toBeDefined();

    await expect(
      pool.query(
        `INSERT INTO rollover_records
           (id, user_id, budget_id, period_id, scope, closing_balance_kobo,
            carried_forward_kobo, released_to_general_pool_kobo, shortfall_kobo,
            created_by)
         VALUES ($1, $2, $3, $4, 'general_pool', 0, 0, 0, 0, $2)`,
        [
          'a0000000-0000-0000-0000-000000000001',
          USER_1,
          BUDGET_1,
          PERIOD_1,
        ],
      ),
    ).resolves.toBeDefined();
  });
});
