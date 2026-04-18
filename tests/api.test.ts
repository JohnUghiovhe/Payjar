import { createHmac } from 'crypto';

import request from 'supertest';
import { IMemoryDb, newDb } from 'pg-mem';

import { createApp } from '../src/app';
import { initializeDatabase } from '../src/database';
import { WalletService } from '../src/service';

describe('PayJar API', () => {
  let db: IMemoryDb;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = newDb();
    const pgAdapter = db.adapters.createPg();
    const pool = new pgAdapter.Pool();

    await initializeDatabase(pool);

    const service = new WalletService(pool, 'test_paystack_secret');
    await service.seedSettlementAccount();

    app = createApp(service);
  });

  test('creates a wallet', async () => {
    const response = await request(app).post('/wallets').send({ userId: 'alice' });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe('alice');
    expect(response.body.data.balance).toBe(0);
  });

  test('validates deposit payload and idempotency header', async () => {
    const missingHeader = await request(app).post('/wallets/alice/deposits').send({ amount: 1500 });

    expect(missingHeader.status).toBe(400);

    const invalidAmount = await request(app)
      .post('/wallets/alice/deposits')
      .set('idempotency-key', 'dep-key-1')
      .send({ amount: -10 });

    expect(invalidAmount.status).toBe(400);
  });

  test('returns same deposit transaction for same idempotency key', async () => {
    const first = await request(app)
      .post('/wallets/alice/deposits')
      .set('idempotency-key', 'dep-1')
      .send({ amount: 2000 });

    const second = await request(app)
      .post('/wallets/alice/deposits')
      .set('idempotency-key', 'dep-1')
      .send({ amount: 2000 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.transaction.reference).toBe(first.body.data.transaction.reference);
  });

  test('completes deposit via verified Paystack webhook', async () => {
    const deposit = await request(app)
      .post('/wallets/alice/deposits')
      .set('idempotency-key', 'dep-2')
      .send({ amount: 1500 });

    const reference: string = deposit.body.data.transaction.reference;
    const webhookBody = {
      event: 'charge.success',
      data: {
        reference,
        amount: 150000,
      },
    };

    const rawPayload = JSON.stringify(webhookBody);
    const signature = createHmac('sha512', 'test_paystack_secret').update(rawPayload).digest('hex');

    const webhookResponse = await request(app)
      .post('/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.data.transaction.status).toBe('completed');

    const wallet = await request(app).get('/wallets/alice');

    expect(wallet.status).toBe(200);
    expect(wallet.body.data.balance).toBe(1500);
  });

  test('rejects transfer when sender has insufficient funds', async () => {
    await request(app).post('/wallets').send({ userId: 'sender' });

    const transfer = await request(app)
      .post('/transfers')
      .set('idempotency-key', 'trf-1')
      .send({ senderUserId: 'sender', recipientUserId: 'recipient', amount: 500 });

    expect(transfer.status).toBe(400);
    expect(transfer.body.error).toContain('Insufficient balance');
  });

  test('serves Swagger docs', async () => {
    const docs = await request(app).get('/openapi.json');

    expect(docs.status).toBe(200);
    expect(docs.body.openapi).toBe('3.0.3');
    expect(docs.body.paths['/wallets']).toBeDefined();
  });
});
