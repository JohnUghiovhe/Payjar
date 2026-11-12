import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import type { Dirent } from 'fs';
import type { PoolClient } from 'pg';

const MIGRATIONS_TABLE = 'schema_migrations';
const ADVISORY_LOCK_KEY = [724169, 1] as const;

export interface MigrationOptions {
  migrationsDir?: string;
  postgresFeatures?: boolean;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly migrationId?: string,
    public readonly migrationCause?: unknown,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

type MigrationClient = Pick<PoolClient, 'query'>;

type LoadedMigration = {
  id: string;
  checksum: string;
  sql: string;
  postgresSql: string | null;
};

const normalizeSql = (sql: string): string =>
  sql.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

const hashMigration = (sql: string, postgresSql: string | null): string =>
  createHash('sha256')
    .update(normalizeSql(sql), 'utf8')
    .update('\n-- postgres add-on --\n', 'utf8')
    .update(normalizeSql(postgresSql ?? ''), 'utf8')
    .digest('hex');

const loadMigrations = async (migrationsDir: string): Promise<LoadedMigration[]> => {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new MigrationError(`Cannot read migrations directory "${migrationsDir}": ${detail}`, undefined, error);
  }

  const files = entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith('.sql') &&
        !entry.name.endsWith('.postgres.sql'),
    )
    .map(entry => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  if (files.length === 0) {
    throw new MigrationError(`No migration files found in "${migrationsDir}".`);
  }

  for (const file of files) {
    if (!/^\d{3,}_[A-Za-z0-9_]+\.sql$/.test(file)) {
      throw new MigrationError(
        `Invalid migration filename "${file}". Use a zero-padded numeric prefix and a snake_case name, for example 002_add_budget_index.sql.`,
      );
    }
  }

  const sidecarNames = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.postgres.sql'))
    .map(entry => entry.name);

  for (const sidecar of sidecarNames) {
    const base = sidecar.slice(0, -'.postgres.sql'.length);
    if (!files.includes(`${base}.sql`)) {
      throw new MigrationError(
        `PostgreSQL add-on "${sidecar}" has no matching portable migration file.`,
      );
    }
  }

  const sidecars = new Set(sidecarNames);

  return Promise.all(
    files.map(async file => {
      const id = file.slice(0, -'.sql'.length);
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      const postgresFile = `${id}.postgres.sql`;
      const postgresSql = sidecars.has(postgresFile)
        ? await fs.readFile(path.join(migrationsDir, postgresFile), 'utf8')
        : null;

      if (!sql.trim()) {
        throw new MigrationError(`Migration "${file}" is empty.`);
      }

      return {
        id,
        checksum: hashMigration(sql, postgresSql),
        sql,
        postgresSql,
      };
    }),
  );
};

const hashOfApplied = async (client: MigrationClient): Promise<Map<string, string>> => {
  const result = await client.query<{ id: string; checksum: string }>(
    `SELECT id, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );

  return new Map(result.rows.map(row => [row.id, row.checksum]));
};

const validateAppliedMigrations = (
  migrations: LoadedMigration[],
  applied: Map<string, string>,
): void => {
  for (const migration of migrations) {
    const recordedChecksum = applied.get(migration.id);

    if (recordedChecksum !== undefined && recordedChecksum !== migration.checksum) {
      throw new MigrationError(
        `Migration "${migration.id}" has changed since it was applied. Applied migrations are immutable; add a new migration instead.`,
        migration.id,
      );
    }
  }

  const knownIds = new Set(migrations.map(migration => migration.id));

  for (const id of applied.keys()) {
    if (!knownIds.has(id)) {
      throw new MigrationError(
        `Applied migration "${id}" is missing from the migrations directory. Restore the file or restore the database backup.`,
        id,
      );
    }
  }
};

const applyMigration = async (
  client: MigrationClient,
  migration: LoadedMigration,
  postgresFeatures: boolean,
): Promise<void> => {
  try {
    await client.query('BEGIN');
    await client.query(migration.sql);

    if (postgresFeatures && migration.postgresSql !== null) {
      await client.query(migration.postgresSql);
    }

    await client.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum) VALUES ($1, $2)`,
      [migration.id, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    let rolledBack = false;

    try {
      await client.query('ROLLBACK');
      rolledBack = true;
    } catch {
      // Preserve the original migration error if rollback also fails.
    }

    const detail = error instanceof Error ? error.message : String(error);
    const outcome = rolledBack
      ? 'failed and was rolled back'
      : 'failed and could not be confirmed as rolled back';

    throw new MigrationError(
      `Migration "${migration.id}" ${outcome}. Fix the migration and run migrations again. Cause: ${detail}`,
      migration.id,
      error,
    );
  }
};

export const runMigrations = async (
  client: MigrationClient,
  options: MigrationOptions = {},
): Promise<MigrationResult> => {
  const migrationsDir =
    options.migrationsDir ?? path.join(process.cwd(), 'database', 'migrations');
  const postgresFeatures = options.postgresFeatures ?? true;
  const migrations = await loadMigrations(migrationsDir);
  let lockAcquired = false;

  try {
    if (postgresFeatures) {
      try {
        await client.query('SELECT pg_advisory_lock($1, $2)', [...ADVISORY_LOCK_KEY]);
        lockAcquired = true;
      } catch (error) {
        throw new MigrationError(
          'Could not acquire the database migration lock. Ensure the database is reachable and the application role can use advisory locks. pg-mem tests must pass postgresFeatures: false.',
          undefined,
          error,
        );
      }
    }

    const trackingTable = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = $1
       ) AS exists`,
      [MIGRATIONS_TABLE],
    );

    if (!trackingTable.rows[0]?.exists) {
      await client.query(`
        CREATE TABLE ${MIGRATIONS_TABLE} (
          id text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    const applied = await hashOfApplied(client);
    validateAppliedMigrations(migrations, applied);

    const pending = migrations.filter(migration => !applied.has(migration.id));

    for (const migration of pending) {
      await applyMigration(client, migration, postgresFeatures);
    }

    return {
      applied: pending.map(migration => migration.id),
      skipped: migrations
        .filter(migration => applied.has(migration.id))
        .map(migration => migration.id),
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [...ADVISORY_LOCK_KEY]);
      } catch {
        // Releasing a session advisory lock must not hide an earlier failure.
      }
    }
  }
};
