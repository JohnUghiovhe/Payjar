import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  toLocalDateOrNull,
  type Queryable,
} from './repository.js';
import type {
  CreateIncomeSourceInput,
  IncomeEntry,
  IncomeSource,
  RecordIncomeInput,
} from './types.js';

type IncomeSourceRow = {
  id: string;
  user_id: string;
  name: string;
  source_type: IncomeSource['sourceType'];
  active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type IncomeEntryRow = {
  id: string;
  user_id: string;
  budget_period_id: string;
  income_source_id: string | null;
  amount_kobo: bigint | number | string;
  currency: 'NGN';
  status: IncomeEntry['status'];
  expected_on: Date | string | null;
  received_at: Date | string | null;
  note: string | null;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapIncomeSource = (row: IncomeSourceRow): IncomeSource => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  sourceType: row.source_type,
  active: row.active,
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

const mapIncomeEntry = (row: IncomeEntryRow): IncomeEntry => ({
  id: row.id,
  userId: row.user_id,
  budgetPeriodId: row.budget_period_id,
  incomeSourceId: row.income_source_id,
  amountKobo: toKobo(row.amount_kobo),
  currency: row.currency,
  status: row.status,
  expectedOn: toLocalDateOrNull(row.expected_on),
  receivedAt: toIsoTimestampOrNull(row.received_at),
  note: row.note,
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createIncomeSource = async (
  db: Queryable,
  input: CreateIncomeSourceInput,
): Promise<IncomeSource> => {
  const rows = await runQuery<IncomeSourceRow>(
    db,
    'createIncomeSource',
    `INSERT INTO income_sources (id, user_id, name, source_type, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.name,
      input.sourceType,
      input.active ?? true,
    ],
  );

  return mapIncomeSource(requireRow(rows, 'Income source'));
};

export const getIncomeSource = async (
  db: Queryable,
  incomeSourceId: string,
): Promise<IncomeSource> => {
  const rows = await runQuery<IncomeSourceRow>(
    db,
    'getIncomeSource',
    'SELECT * FROM income_sources WHERE id = $1 AND deleted_at IS NULL',
    [incomeSourceId],
  );

  return mapIncomeSource(requireRow(rows, 'Income source'));
};

export const listIncomeSources = async (
  db: Queryable,
  userId: string,
  options: { activeOnly?: boolean } = {},
): Promise<IncomeSource[]> => {
  const rows = await runQuery<IncomeSourceRow>(
    db,
    'listIncomeSources',
    `SELECT * FROM income_sources
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND (NOT $2::boolean OR active = true)
     ORDER BY name ASC`,
    [userId, options.activeOnly ?? false],
  );

  return rows.map(mapIncomeSource);
};

export const recordIncomeEntry = async (
  db: Queryable,
  input: RecordIncomeInput,
): Promise<IncomeEntry> => {
  const rows = await runQuery<IncomeEntryRow>(
    db,
    'recordIncomeEntry',
    `INSERT INTO income_entries (
       id, user_id, budget_period_id, income_source_id, amount_kobo,
       currency, status, expected_on, received_at, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.budgetPeriodId,
      input.incomeSourceId ?? null,
      input.amountKobo,
      input.currency ?? 'NGN',
      input.status,
      input.expectedOn ?? null,
      input.receivedAt ?? null,
      input.note ?? null,
    ],
  );

  return mapIncomeEntry(requireRow(rows, 'Income entry'));
};

export const getIncomeEntry = async (
  db: Queryable,
  incomeEntryId: string,
): Promise<IncomeEntry> => {
  const rows = await runQuery<IncomeEntryRow>(
    db,
    'getIncomeEntry',
    'SELECT * FROM income_entries WHERE id = $1 AND deleted_at IS NULL',
    [incomeEntryId],
  );

  return mapIncomeEntry(requireRow(rows, 'Income entry'));
};

export const listIncomeEntries = async (
  db: Queryable,
  budgetPeriodId: string,
): Promise<IncomeEntry[]> => {
  const rows = await runQuery<IncomeEntryRow>(
    db,
    'listIncomeEntries',
    `SELECT * FROM income_entries
     WHERE budget_period_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [budgetPeriodId],
  );

  return rows.map(mapIncomeEntry);
};
