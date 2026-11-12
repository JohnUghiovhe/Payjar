import { randomUUID } from 'crypto';

import type { Kobo } from '../../budgeting/money.js';
import {
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKobo,
  type Queryable,
} from './repository.js';
import type {
  CreatePeriodJarSummaryInput,
  PeriodJarSummary,
  RevisionListOptions,
} from './types.js';

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

export const createPeriodJarSummary = async (
  db: Queryable,
  input: CreatePeriodJarSummaryInput,
): Promise<PeriodJarSummary> => {
  const rows = await runQuery<PeriodJarSummaryRow>(
    db,
    'createPeriodJarSummary',
    `INSERT INTO period_jar_summaries (
       id, user_id, budget_id, period_id, jar_id, currency, revision,
       opening_balance_kobo, allocated_kobo, spent_kobo, closing_balance_kobo,
       rollover_policy, carried_forward_kobo, released_to_general_pool_kobo,
       shortfall_kobo
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      randomUUID(),
      input.userId,
      input.budgetId,
      input.periodId,
      input.jarId,
      input.currency,
      input.revision,
      input.openingBalanceKobo,
      input.allocatedKobo,
      input.spentKobo,
      input.closingBalanceKobo,
      input.rolloverPolicy,
      input.carriedForwardKobo,
      input.releasedToGeneralPoolKobo,
      input.shortfallKobo,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('Period jar summary insert returned no row.');
  return mapPeriodJarSummary(row);
};

export const supersedeCurrentPeriodJarSummaries = async (
  db: Queryable,
  periodId: string,
): Promise<PeriodJarSummary[]> => {
  const rows = await runQuery<PeriodJarSummaryRow>(
    db,
    'supersedeCurrentPeriodJarSummaries',
    `UPDATE period_jar_summaries
     SET superseded_at = now()
     WHERE period_id = $1 AND superseded_at IS NULL
     RETURNING *`,
    [periodId],
  );

  return rows.map(mapPeriodJarSummary);
};

export const linkSupersededPeriodJarSummary = async (
  db: Queryable,
  summaryId: string,
  supersededById: string,
): Promise<void> => {
  await runQuery(
    db,
    'linkSupersededPeriodJarSummary',
    `UPDATE period_jar_summaries
     SET superseded_by_id = $2
     WHERE id = $1 AND superseded_at IS NOT NULL`,
    [summaryId, supersededById],
  );
};

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

type JarCarryForwardRow = {
  jar_id: string;
  carried_forward_kobo: bigint | number | string;
};

export interface JarCarryForward {
  jarId: string;
  carriedForwardKobo: Kobo;
}

/**
 * Returns the most recent non-superseded carry-forward for each jar from
 * periods before the supplied sequence. This is the opening balance for the
 * current period.
 */
export const listJarCarryForwards = async (
  db: Queryable,
  budgetId: string,
  beforeSequence: number,
): Promise<JarCarryForward[]> => {
  const rows = await runQuery<JarCarryForwardRow>(
    db,
    'listJarCarryForwards',
    `SELECT pjs.jar_id, pjs.carried_forward_kobo
     FROM period_jar_summaries pjs
     JOIN budget_periods bp ON bp.id = pjs.period_id
     WHERE pjs.budget_id = $1
       AND pjs.superseded_at IS NULL
       AND bp.sequence < $2
     ORDER BY bp.sequence DESC`,
    [budgetId, beforeSequence],
  );

  const latestByJar = new Map<string, Kobo>();

  for (const row of rows) {
    if (!latestByJar.has(row.jar_id)) {
      latestByJar.set(row.jar_id, toKobo(row.carried_forward_kobo));
    }
  }

  return [...latestByJar.entries()].map(([jarId, carriedForwardKobo]) => ({
    jarId,
    carriedForwardKobo,
  }));
};
