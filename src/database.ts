import fs from 'fs/promises';
import path from 'path';

import { Pool } from 'pg';

import { AppError } from './errors';

const resolveSchemaPath = (): string => path.join(process.cwd(), 'database', 'schema.sql');

export const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new AppError(500, 'DATABASE_URL is required to connect to PostgreSQL.');
  }

  return new Pool({ connectionString });
};

export const initializeDatabase = async (pool: Pick<Pool, 'query'>): Promise<void> => {
  const schemaPath = resolveSchemaPath();
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schema);
};
