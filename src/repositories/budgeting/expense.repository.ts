import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  type Queryable,
} from './repository.js';
import type { Expense, RecordExpenseInput } from './types.js';

type ExpenseRow = {
  id: string;
  user_id: string;
  budget_period_id: string;
  category_id: string;
  jar_id: string | null;
  entry_type: Expense['entryType'];
  adjusts_expense_id: string | null;
  amount_kobo: bigint | number | string;
  currency: 'NGN';
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  occurred_at: Date | string;
  source: Expense['source'];
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  userId: row.user_id,
  budgetPeriodId: row.budget_period_id,
  categoryId: row.category_id,
  jarId: row.jar_id,
  entryType: row.entry_type,
  adjustsExpenseId: row.adjusts_expense_id,
  amountKobo: toKobo(row.amount_kobo),
  currency: row.currency,
  merchant: row.merchant,
  note: row.note,
  paymentMethod: row.payment_method,
  occurredAt: toIsoTimestamp(row.occurred_at),
  source: row.source,
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const recordExpense = async (
  db: Queryable,
  input: RecordExpenseInput,
): Promise<Expense> => {
  const rows = await runQuery<ExpenseRow>(
    db,
    'recordExpense',
    `INSERT INTO expenses (
       id, user_id, budget_period_id, category_id, jar_id, entry_type,
       adjusts_expense_id, amount_kobo, currency, merchant, note,
       payment_method, occurred_at, source
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.budgetPeriodId,
      input.categoryId,
      input.jarId ?? null,
      input.entryType ?? 'expense',
      input.adjustsExpenseId ?? null,
      input.amountKobo,
      input.currency ?? 'NGN',
      input.merchant ?? null,
      input.note ?? null,
      input.paymentMethod ?? null,
      input.occurredAt,
      input.source ?? 'manual',
    ],
  );

  return mapExpense(requireRow(rows, 'Expense'));
};

export const getExpense = async (
  db: Queryable,
  expenseId: string,
): Promise<Expense> => {
  const rows = await runQuery<ExpenseRow>(
    db,
    'getExpense',
    'SELECT * FROM expenses WHERE id = $1 AND deleted_at IS NULL',
    [expenseId],
  );

  return mapExpense(requireRow(rows, 'Expense'));
};

export const listExpenses = async (
  db: Queryable,
  budgetPeriodId: string,
): Promise<Expense[]> => {
  const rows = await runQuery<ExpenseRow>(
    db,
    'listExpenses',
    `SELECT * FROM expenses
     WHERE budget_period_id = $1 AND deleted_at IS NULL
     ORDER BY occurred_at DESC, created_at DESC`,
    [budgetPeriodId],
  );

  return rows.map(mapExpense);
};
