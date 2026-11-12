import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toInteger,
  type Queryable,
} from './repository.js';
import type { Budget, CreateBudgetInput } from './types.js';

type BudgetRow = {
  id: string;
  user_id: string;
  name: string;
  period_type: Budget['periodType'];
  currency: 'NGN';
  timezone: string;
  status: Budget['status'];
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapBudget = (row: BudgetRow): Budget => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  periodType: row.period_type,
  currency: row.currency,
  timezone: row.timezone,
  status: row.status,
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createBudget = async (
  db: Queryable,
  input: CreateBudgetInput,
): Promise<Budget> => {
  const rows = await runQuery<BudgetRow>(
    db,
    'createBudget',
    `INSERT INTO budgets (
       id, user_id, name, period_type, currency, timezone, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.name,
      input.periodType,
      input.currency ?? 'NGN',
      input.timezone,
    ],
  );

  return mapBudget(requireRow(rows, 'Budget'));
};

export const getBudget = async (
  db: Queryable,
  budgetId: string,
): Promise<Budget> => {
  const rows = await runQuery<BudgetRow>(
    db,
    'getBudget',
    'SELECT * FROM budgets WHERE id = $1 AND deleted_at IS NULL',
    [budgetId],
  );

  return mapBudget(requireRow(rows, 'Budget'));
};

export const getUserActiveBudget = async (
  db: Queryable,
  userId: string,
): Promise<Budget | null> => {
  const rows = await runQuery<BudgetRow>(
    db,
    'getUserActiveBudget',
    `SELECT * FROM budgets
     WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  return rows[0] ? mapBudget(rows[0]) : null;
};

export const listBudgetsForUser = async (
  db: Queryable,
  userId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Budget[]> => {
  const rows = await runQuery<BudgetRow>(
    db,
    'listBudgetsForUser',
    `SELECT * FROM budgets
     WHERE user_id = $1 AND ($2::boolean OR deleted_at IS NULL)
     ORDER BY created_at DESC`,
    [userId, options.includeDeleted ?? false],
  );

  return rows.map(mapBudget);
};
