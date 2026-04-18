import dotenv from 'dotenv';

import { createApp } from './app';
import { createDatabasePool, initializeDatabase } from './database';
import { WalletService } from './service';

const bootstrap = async (): Promise<void> => {
  dotenv.config();

  const pool = createDatabasePool();
  await initializeDatabase(pool);

  const walletService = new WalletService(pool, process.env.PAYSTACK_SECRET_KEY ?? 'paystack_secret_missing');
  await walletService.seedSettlementAccount();

  const app = createApp(walletService);
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    process.stdout.write(`PayFlow API listening on port ${port}\n`);
  });
};

bootstrap().catch((error: Error) => {
  process.stderr.write(`Failed to start PayFlow: ${error.message}\n`);
  process.exit(1);
});