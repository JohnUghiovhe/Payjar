import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toKobo,
  type Queryable,
} from './repository.js';
import type { JarAllocation, SaveJarAllocationInput } from './types.js';

type JarAllocationRow = {
  id: string;
  user_id: string;
  budget_id: string;
  period_id: string;
  jar_id: string;
  amount_kobo: bigint | number | string;
  currency: 'NGN';
  note: string | null;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

const mapJarAllocation = (row: JarAllocationRow): JarAllocation => ({
  id: row.id,
  userId: row.user_id,
  budgetId: row.budget_id,
  periodId: row.period_id,
  jarId: row.jar_id,
  amountKobo: toKobo(row.amount_kobo),
  currency: row.currency,
  note: row.note,
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
});

/**
 * Creates the allocation for a period/jar pair, or replaces its amount and note
 * when one already exists. One allocation per period and jar is a database rule.
 */
export const saveJarAllocation = async (
  db: Queryable,
  input: SaveJarAllocationInput,
): Promise<JarAllocation> => {
  const rows = await runQuery<JarAllocationRow>(
    db,
    'saveJarAllocation',
    `INSERT INTO jar_allocations (
       id, user_id, budget_id, period_id, jar_id, amount_kobo, currency, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (period_id, jar_id) DO UPDATE SET
       amount_kobo = EXCLUDED.amount_kobo,
       currency = EXCLUDED.currency,
       note = EXCLUDED.note,
       updated_at = now(),
       version = jar_allocations.version + 1
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.budgetId,
      input.periodId,
      input.jarId,
      input.amountKobo,
      input.currency ?? 'NGN',
      input.note ?? null,
    ],
  );

  return mapJarAllocation(requireRow(rows, 'Jar allocation'));
};

export const getJarAllocation = async (
  db: Queryable,
  periodId: string,
  jarId: string,
): Promise<JarAllocation | null> => {
  const rows = await runQuery<JarAllocationRow>(
    db,
    'getJarAllocation',
    'SELECT * FROM jar_allocations WHERE period_id = $1 AND jar_id = $2',
    [periodId, jarId],
  );

  return rows[0] ? mapJarAllocation(rows[0]) : null;
};

export const listJarAllocations = async (
  db: Queryable,
  periodId: string,
): Promise<JarAllocation[]> => {
  const rows = await runQuery<JarAllocationRow>(
    db,
    'listJarAllocations',
    `SELECT * FROM jar_allocations
     WHERE period_id = $1
     ORDER BY created_at ASC`,
    [periodId],
  );

  return rows.map(mapJarAllocation);
};
