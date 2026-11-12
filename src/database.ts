import { Pool } from 'pg';

import { AppError } from './errors.js';
import { runMigrations } from './migrations.js';
import type { MigrationOptions, MigrationResult } from './migrations.js';

export const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new AppError(500, 'DATABASE_URL is required to connect to PostgreSQL.');
  }

  return new Pool({ connectionString });
};

export const initializeDatabase = async (
  pool: Pick<Pool, 'connect'>,
  options: MigrationOptions = {},
): Promise<MigrationResult> => {
  const client = await pool.connect();

  try {
    return await runMigrations(client, options);
  } finally {
    client.release();
  }
};
