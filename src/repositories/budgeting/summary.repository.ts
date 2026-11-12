import {
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  type Queryable,
} from './repository.js';
import type { PeriodJarSummary, RevisionListOptions } from './types.js';

type PeriodJarSummaryRow = {
  id: string;
  user_id: string;
  budget_id: string;
  period_id: string;
  jar_id: string;
  currency: 'NGN';
  revision: number | string;
  opening_balance_kobo: bigint | number | string;
  allocated_kobo: bigint | number | string;
  spent_kobo: bigint | number | string;
  closing_balance_kobo: bigint | number | string;
  rollover_policy: PeriodJarSummary['rolloverPolicy'];
  carried_forward_kobo: bigint | number | string;
  released_to_general_pool_kobo: bigint | number | string;
  shortfall_kobo: bigint | number | string;
  computed_at: Date | string;
  superseded_at: Date | string | null;
  superseded_by_id: string | null;
};

const mapPeriodJarSummary = (row: PeriodJarSummaryRow): PeriodJarSummary => ({
  id: row.id,
  userId: row.user_id,
  budgetId: row.budget_id,
  periodId: row.period_id,
  jarId: row.jar_id,
  currency: row.currency,
  revision: toInteger(row.revision),
  openingBalanceKobo: toKobo(row.opening_balance_kobo),
  allocatedKobo: toKobo(row.allocated_kobo),
  spentKobo: toKobo(row.spent_kobo),
  closingBalanceKobo: toKobo(row.closing_balance_kobo),
  rolloverPolicy: row.rollover_policy,
  carriedForwardKobo: toKobo(row.carried_forward_kobo),
  releasedToGeneralPoolKobo: toKobo(row.released_to_general_pool_kobo),
  shortfallKobo: toKobo(row.shortfall_kobo),
  computedAt: toIsoTimestamp(row.computed_at),
  supersededAt: toIsoTimestampOrNull(row.superseded_at),
  supersededById: row.superseded_by_id,
});

export const listPeriodJarSummaries = async (
  db: Queryable,
  periodId: string,
  options: RevisionListOptions = {},
): Promise<PeriodJarSummary[]> => {
  const rows = await runQuery<PeriodJarSummaryRow>(
    db,
    'listPeriodJarSummaries',
    `SELECT * FROM period_jar_summaries
     WHERE period_id = $1 AND ($2::boolean OR superseded_at IS NULL)
     ORDER BY jar_id ASC, revision DESC`,
    [periodId, options.includeSuperseded ?? false],
  );

  return rows.map(mapPeriodJarSummary);
};

export const getCurrentPeriodJarSummary = async (
  db: Queryable,
  periodId: string,
  jarId: string,
): Promise<PeriodJarSummary | null> => {
  const rows = await runQuery<PeriodJarSummaryRow>(
    db,
    'getCurrentPeriodJarSummary',
    `SELECT * FROM period_jar_summaries
     WHERE period_id = $1 AND jar_id = $2 AND superseded_at IS NULL
     ORDER BY revision DESC
     LIMIT 1`,
    [periodId, jarId],
  );

  return rows[0] ? mapPeriodJarSummary(rows[0]) : null;
};
