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
import type {
  CreateRolloverRecordInput,
  RevisionListOptions,
  RolloverRecord,
} from './types.js';

type RolloverRecordRow = {
  id: string;
  user_id: string;
  budget_id: string;
  period_id: string;
  jar_id: string | null;
  scope: RolloverRecord['scope'];
  currency: 'NGN';
  revision: number | string;
  policy: RolloverRecord['policy'];
  closing_balance_kobo: bigint | number | string;
  carried_forward_kobo: bigint | number | string;
  released_to_general_pool_kobo: bigint | number | string;
  shortfall_kobo: bigint | number | string;
  next_period_id: string | null;
  superseded_at: Date | string | null;
  superseded_by_id: string | null;
  created_at: Date | string;
  created_by: string;
};

const mapRolloverRecord = (row: RolloverRecordRow): RolloverRecord => ({
  id: row.id,
  userId: row.user_id,
  budgetId: row.budget_id,
  periodId: row.period_id,
  jarId: row.jar_id,
  scope: row.scope,
  currency: row.currency,
  revision: toInteger(row.revision),
  policy: row.policy,
  closingBalanceKobo: toKobo(row.closing_balance_kobo),
  carriedForwardKobo: toKobo(row.carried_forward_kobo),
  releasedToGeneralPoolKobo: toKobo(row.released_to_general_pool_kobo),
  shortfallKobo: toKobo(row.shortfall_kobo),
  nextPeriodId: row.next_period_id,
  supersededAt: toIsoTimestampOrNull(row.superseded_at),
  supersededById: row.superseded_by_id,
  createdAt: toIsoTimestamp(row.created_at),
  createdBy: row.created_by,
});

export const createRolloverRecord = async (
  db: Queryable,
  input: CreateRolloverRecordInput,
): Promise<RolloverRecord> => {
  const rows = await runQuery<RolloverRecordRow>(
    db,
    'createRolloverRecord',
    `INSERT INTO rollover_records (
       id, user_id, budget_id, period_id, jar_id, scope, currency, revision,
       policy, closing_balance_kobo, carried_forward_kobo,
       released_to_general_pool_kobo, shortfall_kobo, next_period_id, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      randomUUID(),
      input.userId,
      input.budgetId,
      input.periodId,
      input.jarId,
      input.scope,
      input.currency,
      input.revision,
      input.policy,
      input.closingBalanceKobo,
      input.carriedForwardKobo,
      input.releasedToGeneralPoolKobo,
      input.shortfallKobo,
      input.nextPeriodId,
      input.createdBy,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('Rollover record insert returned no row.');
  return mapRolloverRecord(row);
};

export const supersedeCurrentRolloverRecords = async (
  db: Queryable,
  periodId: string,
): Promise<RolloverRecord[]> => {
  const rows = await runQuery<RolloverRecordRow>(
    db,
    'supersedeCurrentRolloverRecords',
    `UPDATE rollover_records
     SET superseded_at = now()
     WHERE period_id = $1 AND superseded_at IS NULL
     RETURNING *`,
    [periodId],
  );

  return rows.map(mapRolloverRecord);
};

export const linkSupersededRolloverRecord = async (
  db: Queryable,
  rolloverId: string,
  supersededById: string,
): Promise<void> => {
  await runQuery(
    db,
    'linkSupersededRolloverRecord',
    `UPDATE rollover_records
     SET superseded_by_id = $2
     WHERE id = $1 AND superseded_at IS NOT NULL`,
    [rolloverId, supersededById],
  );
};

export const getRolloverRecord = async (
  db: Queryable,
  rolloverRecordId: string,
): Promise<RolloverRecord> => {
  const rows = await runQuery<RolloverRecordRow>(
    db,
    'getRolloverRecord',
    'SELECT * FROM rollover_records WHERE id = $1',
    [rolloverRecordId],
  );

  return mapRolloverRecord(requireRow(rows, 'Rollover record'));
};

export const listRolloverRecords = async (
  db: Queryable,
  periodId: string,
  options: RevisionListOptions = {},
): Promise<RolloverRecord[]> => {
  const rows = await runQuery<RolloverRecordRow>(
    db,
    'listRolloverRecords',
    `SELECT * FROM rollover_records
     WHERE period_id = $1 AND ($2::boolean OR superseded_at IS NULL)
     ORDER BY scope ASC, revision DESC`,
    [periodId, options.includeSuperseded ?? false],
  );

  return rows.map(mapRolloverRecord);
};
