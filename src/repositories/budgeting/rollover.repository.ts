import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  type Queryable,
} from './repository.js';
import type { RevisionListOptions, RolloverRecord } from './types.js';

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
