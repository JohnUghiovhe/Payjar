import type { Pool } from 'pg';

import type { Kobo } from '../../budgeting/money.js';
import type { LocalDate } from '../../budgeting/types.js';
import { AppError } from '../../errors.js';

/**
 * Anything that can run a parameterised query: a Pool, a PoolClient inside a
 * transaction, or a pg-mem pool in tests.
 */
export type Queryable = Pick<Pool, 'query'>;

export class RepositoryError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runQuery = async <Row extends Record<string, unknown>>(
  db: Queryable,
  operation: string,
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> => {
  try {
    const result = await db.query<Row>(text, values as unknown[]);
    return result.rows;
  } catch (error) {
    throw new RepositoryError(
      operation,
      `${operation} failed: ${describeError(error)}`,
      error,
    );
  }
};

export const requireRow = <Row>(rows: readonly Row[], entityName: string): Row => {
  const row = rows[0];

  if (!row) {
    throw new AppError(404, `${entityName} not found.`);
  }

  return row;
};

type DbTimestamp = Date | string;

export const toIsoTimestamp = (value: DbTimestamp): string =>
  value instanceof Date ? value.toISOString() : value;

export const toIsoTimestampOrNull = (value: DbTimestamp | null): string | null =>
  value === null ? null : toIsoTimestamp(value);

export const toLocalDate = (value: DbTimestamp): LocalDate =>
  (value instanceof Date ? value.toISOString() : value).slice(0, 10);

export const toLocalDateOrNull = (value: DbTimestamp | null): LocalDate | null =>
  value === null ? null : toLocalDate(value);

type DbKobo = bigint | number | string;

export const toKobo = (value: DbKobo): Kobo => BigInt(value);

export const toKoboOrNull = (value: DbKobo | null): Kobo | null =>
  value === null ? null : BigInt(value);

export const toInteger = (value: number | string): number => Number(value);

export const toJsonParameter = (value: unknown | null | undefined): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);
