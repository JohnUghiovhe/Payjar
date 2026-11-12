import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  toLocalDate,
  type Queryable,
} from './repository.js';
import type { Commitment, CreateCommitmentInput } from './types.js';

type CommitmentRow = {
  id: string;
  user_id: string;
  budget_period_id: string;
  name: string;
  amount_kobo: bigint | number | string;
  currency: 'NGN';
  due_on: Date | string;
  status: Commitment['status'];
  recurrence_rule: string | null;
  paid_at: Date | string | null;
  settled_expense_id: string | null;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapCommitment = (row: CommitmentRow): Commitment => ({
  id: row.id,
  userId: row.user_id,
  budgetPeriodId: row.budget_period_id,
  name: row.name,
  amountKobo: toKobo(row.amount_kobo),
  currency: row.currency,
  dueOn: toLocalDate(row.due_on),
  status: row.status,
  recurrenceRule: row.recurrence_rule,
  paidAt: toIsoTimestampOrNull(row.paid_at),
  settledExpenseId: row.settled_expense_id,
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createCommitment = async (
  db: Queryable,
  input: CreateCommitmentInput,
): Promise<Commitment> => {
  const rows = await runQuery<CommitmentRow>(
    db,
    'createCommitment',
    `INSERT INTO commitments (
       id, user_id, budget_period_id, name, amount_kobo, currency, due_on,
       status, recurrence_rule, paid_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.budgetPeriodId,
      input.name,
      input.amountKobo,
      input.currency ?? 'NGN',
      input.dueOn,
      input.status ?? 'planned',
      input.recurrenceRule ?? null,
      input.paidAt ?? null,
    ],
  );

  return mapCommitment(requireRow(rows, 'Commitment'));
};

export const getCommitment = async (
  db: Queryable,
  commitmentId: string,
): Promise<Commitment> => {
  const rows = await runQuery<CommitmentRow>(
    db,
    'getCommitment',
    'SELECT * FROM commitments WHERE id = $1 AND deleted_at IS NULL',
    [commitmentId],
  );

  return mapCommitment(requireRow(rows, 'Commitment'));
};

export const listCommitments = async (
  db: Queryable,
  budgetPeriodId: string,
): Promise<Commitment[]> => {
  const rows = await runQuery<CommitmentRow>(
    db,
    'listCommitments',
    `SELECT * FROM commitments
     WHERE budget_period_id = $1 AND deleted_at IS NULL
     ORDER BY due_on ASC, created_at ASC`,
    [budgetPeriodId],
  );

  return rows.map(mapCommitment);
};
