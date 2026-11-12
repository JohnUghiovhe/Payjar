import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  toKoboOrNull,
  toLocalDate,
  type Queryable,
} from './repository.js';
import type { BudgetPeriod, CreateBudgetPeriodInput } from './types.js';

type BudgetPeriodRow = {
  id: string;
  budget_id: string;
  user_id: string;
  sequence: number | string;
  name: string | null;
  starts_on: Date | string;
  ends_on: Date | string;
  timezone: string;
  currency: 'NGN';
  status: BudgetPeriod['status'];
  opening_unallocated_kobo: bigint | number | string;
  closing_unallocated_kobo: bigint | number | string | null;
  total_income_kobo: bigint | number | string | null;
  total_expense_kobo: bigint | number | string | null;
  total_allocated_kobo: bigint | number | string | null;
  total_released_kobo: bigint | number | string | null;
  total_carried_kobo: bigint | number | string | null;
  total_shortfall_kobo: bigint | number | string | null;
  closed_at: Date | string | null;
  closed_by: string | null;
  reopened_at: Date | string | null;
  reopen_count: number | string;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

const mapBudgetPeriod = (row: BudgetPeriodRow): BudgetPeriod => ({
  id: row.id,
  budgetId: row.budget_id,
  userId: row.user_id,
  sequence: toInteger(row.sequence),
  name: row.name,
  startsOn: toLocalDate(row.starts_on),
  endsOn: toLocalDate(row.ends_on),
  timezone: row.timezone,
  currency: row.currency,
  status: row.status,
  openingUnallocatedKobo: toKobo(row.opening_unallocated_kobo),
  closingUnallocatedKobo: toKoboOrNull(row.closing_unallocated_kobo),
  totalIncomeKobo: toKoboOrNull(row.total_income_kobo),
  totalExpenseKobo: toKoboOrNull(row.total_expense_kobo),
  totalAllocatedKobo: toKoboOrNull(row.total_allocated_kobo),
  totalReleasedKobo: toKoboOrNull(row.total_released_kobo),
  totalCarriedKobo: toKoboOrNull(row.total_carried_kobo),
  totalShortfallKobo: toKoboOrNull(row.total_shortfall_kobo),
  closedAt: toIsoTimestampOrNull(row.closed_at),
  closedBy: row.closed_by,
  reopenedAt: toIsoTimestampOrNull(row.reopened_at),
  reopenCount: toInteger(row.reopen_count),
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
});

export const createBudgetPeriod = async (
  db: Queryable,
  input: CreateBudgetPeriodInput,
): Promise<BudgetPeriod> => {
  const rows = await runQuery<BudgetPeriodRow>(
    db,
    'createBudgetPeriod',
    `INSERT INTO budget_periods (
       id, budget_id, user_id, sequence, name, starts_on, ends_on,
       timezone, currency, status, opening_unallocated_kobo
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.budgetId,
      input.userId,
      input.sequence,
      input.name ?? null,
      input.startsOn,
      input.endsOn,
      input.timezone,
      input.currency ?? 'NGN',
      input.status ?? 'draft',
      input.openingUnallocatedKobo ?? 0n,
    ],
  );

  return mapBudgetPeriod(requireRow(rows, 'Budget period'));
};

export const getBudgetPeriod = async (
  db: Queryable,
  periodId: string,
): Promise<BudgetPeriod> => {
  const rows = await runQuery<BudgetPeriodRow>(
    db,
    'getBudgetPeriod',
    'SELECT * FROM budget_periods WHERE id = $1',
    [periodId],
  );

  return mapBudgetPeriod(requireRow(rows, 'Budget period'));
};

/**
 * Locks the period row for the remainder of the transaction. Use this before
 * allocation changes or any operation that must not interleave with closing.
 */
export const getBudgetPeriodForUpdate = async (
  db: Queryable,
  periodId: string,
): Promise<BudgetPeriod | null> => {
  const rows = await runQuery<BudgetPeriodRow>(
    db,
    'getBudgetPeriodForUpdate',
    'SELECT * FROM budget_periods WHERE id = $1 FOR UPDATE',
    [periodId],
  );

  return rows[0] ? mapBudgetPeriod(rows[0]) : null;
};

export const getActiveBudgetPeriod = async (
  db: Queryable,
  budgetId: string,
): Promise<BudgetPeriod | null> => {
  const rows = await runQuery<BudgetPeriodRow>(
    db,
    'getActiveBudgetPeriod',
    `SELECT * FROM budget_periods
     WHERE budget_id = $1 AND status = 'active'
     ORDER BY sequence DESC
     LIMIT 1`,
    [budgetId],
  );

  return rows[0] ? mapBudgetPeriod(rows[0]) : null;
};

export const listBudgetPeriods = async (
  db: Queryable,
  budgetId: string,
): Promise<BudgetPeriod[]> => {
  const rows = await runQuery<BudgetPeriodRow>(
    db,
    'listBudgetPeriods',
    `SELECT * FROM budget_periods
     WHERE budget_id = $1
     ORDER BY sequence ASC`,
    [budgetId],
  );

  return rows.map(mapBudgetPeriod);
};
