import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { describe, expect, test } from '@jest/globals';
import { newDb } from 'pg-mem';

import { initializeDatabase } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';

const createPool = () => {
  const db = newDb();
  return new (db.adapters.createPg().Pool)();
};

const createMigrationFixture = async (
  files: Record<string, string>,
): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'payjar-migrations-'));

  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(directory, name), content, 'utf8');
  }

  return directory;
};

const removeMigrationFixture = async (directory: string): Promise<void> => {
  await rm(directory, { recursive: true, force: true });
};

describe('database migrations', () => {
  test('applies the initial migration once and tracks it', async () => {
    const pool = createPool();

    const firstRun = await initializeDatabase(pool, { postgresFeatures: false });
    expect(firstRun.applied).toEqual([
      '001_initial_schema',
      '002_audit_event_append_only',
    ]);
    const secondRun = await initializeDatabase(pool, { postgresFeatures: false });
    expect(secondRun.applied).toEqual([]);
    expect(secondRun.skipped).toEqual([
      '001_initial_schema',
      '002_audit_event_append_only',
    ]);

    const tracking = (await pool.query(
      'SELECT id, checksum FROM schema_migrations ORDER BY id',
    )) as { rows: Array<{ id: string; checksum: string }> };

    expect(tracking.rows).toHaveLength(2);
    expect(tracking.rows[0]?.id).toBe('001_initial_schema');
    expect(tracking.rows[1]?.id).toBe('002_audit_event_append_only');
    expect(tracking.rows[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);

    await expect(pool.query('SELECT * FROM wallets')).resolves.toBeDefined();
    await expect(pool.query('SELECT * FROM users')).resolves.toBeDefined();
  });

  test('rolls back a failed migration and records only earlier migrations', async () => {
    const directory = await createMigrationFixture({
      '001_ok.sql': 'CREATE TABLE migration_first (id integer PRIMARY KEY);',
      '002_bad.sql': 'THIS IS NOT VALID SQL;',
    });

    try {
      const pool = createPool();
      const client = await pool.connect();

      try {
        await expect(
          runMigrations(client, {
            migrationsDir: directory,
            postgresFeatures: false,
          }),
        ).rejects.toThrow(/Migration "002_bad" failed/);

        const tracking = (await client.query(
          'SELECT id FROM schema_migrations ORDER BY id',
        )) as { rows: Array<{ id: string }> };
        expect(tracking.rows.map((row: { id: string }) => row.id)).toEqual([
          '001_ok',
        ]);
      } finally {
        client.release();
      }

      await writeFile(
        path.join(directory, '002_bad.sql'),
        'CREATE TABLE migration_fixed (id integer PRIMARY KEY);',
        'utf8',
      );

      const retryClient = await pool.connect();
      try {
        const retry = await runMigrations(retryClient, {
          migrationsDir: directory,
          postgresFeatures: false,
        });
        expect(retry.applied).toEqual(['002_bad']);
        await expect(
          retryClient.query('SELECT * FROM migration_fixed'),
        ).resolves.toBeDefined();
      } finally {
        retryClient.release();
      }
    } finally {
      await removeMigrationFixture(directory);
    }
  });

  test('rejects edits to an applied migration', async () => {
    const directory = await createMigrationFixture({
      '001_checksum.sql': 'CREATE TABLE checksum_probe (id integer PRIMARY KEY);',
    });

    try {
      const pool = createPool();
      const client = await pool.connect();

      try {
        await runMigrations(client, {
          migrationsDir: directory,
          postgresFeatures: false,
        });

        await writeFile(
          path.join(directory, '001_checksum.sql'),
          'CREATE TABLE checksum_probe (id integer PRIMARY KEY, note text);',
          'utf8',
        );

        await expect(
          runMigrations(client, {
            migrationsDir: directory,
            postgresFeatures: false,
          }),
        ).rejects.toThrow(/has changed since it was applied/);
      } finally {
        client.release();
      }
    } finally {
      await removeMigrationFixture(directory);
    }
  });

  test('skips PostgreSQL add-ons when PostgreSQL features are disabled', async () => {
    const directory = await createMigrationFixture({
      '001_portable.sql': 'CREATE TABLE portable_probe (id integer PRIMARY KEY);',
      '001_portable.postgres.sql': 'THIS ADD-ON MUST NOT RUN IN PG-MEM;',
    });

    try {
      const pool = createPool();

      const result = await initializeDatabase(pool, {
        migrationsDir: directory,
        postgresFeatures: false,
      });

      expect(result.applied).toEqual(['001_portable']);
      await expect(
        pool.query('SELECT * FROM portable_probe'),
      ).resolves.toBeDefined();
    } finally {
      await removeMigrationFixture(directory);
    }
  });
});
