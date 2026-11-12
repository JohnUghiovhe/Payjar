import { randomUUID } from 'crypto';

import {
  requireRow,
  runQuery,
  toInteger,
  toIsoTimestamp,
  toIsoTimestampOrNull,
  toKoboOrNull,
  type Queryable,
} from './repository.js';
import type { CreateJarInput, Jar } from './types.js';

type JarRow = {
  id: string;
  budget_id: string;
  user_id: string;
  name: string;
  kind: Jar['kind'];
  rollover_policy: Jar['rolloverPolicy'];
  category_id: string | null;
  target_kobo: bigint | number | string | null;
  currency: 'NGN';
  sort_order: number | string;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const mapJar = (row: JarRow): Jar => ({
  id: row.id,
  budgetId: row.budget_id,
  userId: row.user_id,
  name: row.name,
  kind: row.kind,
  rolloverPolicy: row.rollover_policy,
  categoryId: row.category_id,
  targetKobo: toKoboOrNull(row.target_kobo),
  currency: row.currency,
  sortOrder: toInteger(row.sort_order),
  version: toInteger(row.version),
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
  deletedAt: toIsoTimestampOrNull(row.deleted_at),
});

export const createJar = async (
  db: Queryable,
  input: CreateJarInput,
): Promise<Jar> => {
  const rows = await runQuery<JarRow>(
    db,
    'createJar',
    `INSERT INTO jars (
       id, budget_id, user_id, name, kind, rollover_policy, category_id,
       target_kobo, currency, sort_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.id ?? randomUUID(),
      input.budgetId,
      input.userId,
      input.name,
      input.kind,
      input.rolloverPolicy,
      input.categoryId ?? null,
      input.targetKobo ?? null,
      input.currency ?? 'NGN',
      input.sortOrder ?? 0,
    ],
  );

  return mapJar(requireRow(rows, 'Jar'));
};

export const getJar = async (
  db: Queryable,
  jarId: string,
): Promise<Jar> => {
  const rows = await runQuery<JarRow>(
    db,
    'getJar',
    'SELECT * FROM jars WHERE id = $1 AND deleted_at IS NULL',
    [jarId],
  );

  return mapJar(requireRow(rows, 'Jar'));
};

export const listJars = async (
  db: Queryable,
  budgetId: string,
): Promise<Jar[]> => {
  const rows = await runQuery<JarRow>(
    db,
    'listJars',
    `SELECT * FROM jars
     WHERE budget_id = $1 AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [budgetId],
  );

  return rows.map(mapJar);
};
