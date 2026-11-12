import dotenv from 'dotenv';

import { createDatabasePool, initializeDatabase } from './database.js';

const main = async (): Promise<void> => {
  dotenv.config();

  const pool = createDatabasePool();

  try {
    const result = await initializeDatabase(pool);

    if (result.applied.length === 0) {
      process.stdout.write('No pending migrations.\n');
      return;
    }

    for (const id of result.applied) {
      process.stdout.write(`Applied migration ${id}.\n`);
    }
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
