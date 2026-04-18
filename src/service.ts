import { createHmac, randomUUID } from 'crypto';
import { Pool } from 'pg';

import {
  ApiResponse,
  DepositIntentInput,
  LedgerEntry,
  PaystackVerificationResult,
  Transaction,
  TransferInput,
  Wallet,
  WebhookEvent,
} from './domain';
import { AppError } from './errors';

const SYSTEM_CLEARING_USER_ID = 'SYSTEM_CLEARING_ACCOUNT';

const now = () => new Date().toISOString();

const roundMoney = (value: number): number => Number(value.toFixed(2));

const ensurePositiveAmount = (amount: number): void => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
};

const ensureNonEmptyString = (value: string, fieldName: string): void => {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
};

const hashPayload = (payload: unknown): string =>
  createHmac('sha256', 'payflow-idempotency').update(JSON.stringify(payload)).digest('hex');

type WalletRow = {
  id: string;
  user_id: string;
  currency: 'NGN';
  balance: string;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: string;
  reference: string;
  type: 'deposit' | 'transfer';
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  amount: string;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  user_id: string;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type LedgerRow = {
  id: string;
  transaction_id: string;
  wallet_id: string | null;
  direction: 'debit' | 'credit';
  amount: string;
  running_balance: string | null;
  created_at: string;
};

type IdempotencyRow = {
  key: string;
  scope: string;
  request_hash: string;
  response: unknown;
};

const mapWallet = (row: WalletRow): Wallet => ({
  id: row.id,
  userId: row.user_id,
  currency: row.currency,
  balance: Number(row.balance),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  reference: row.reference,
  type: row.type,
  status: row.status,
  amount: Number(row.amount),
  fromWalletId: row.from_wallet_id,
  toWalletId: row.to_wallet_id,
  userId: row.user_id,
  idempotencyKey: row.idempotency_key,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLedgerEntry = (row: LedgerRow): LedgerEntry => ({
  id: row.id,
  transactionId: row.transaction_id,
  walletId: row.wallet_id,
  direction: row.direction,
  amount: Number(row.amount),
  runningBalance: row.running_balance ? Number(row.running_balance) : null,
  createdAt: row.created_at,
});

export class WalletService {
  constructor(private readonly pool: Pick<Pool, 'query' | 'connect'>, private readonly paystackSecretKey: string) {}

  async createWallet(userId: string): Promise<Wallet> {
    ensureNonEmptyString(userId, 'userId');

    const result = await this.pool.query<WalletRow>(
      `
      INSERT INTO wallets (id, user_id, currency, balance, status, created_at, updated_at)
      VALUES ($1, $2, 'NGN', 0, 'active', now(), now())
      ON CONFLICT (user_id) DO UPDATE SET updated_at = wallets.updated_at
      RETURNING *
      `,
      [randomUUID(), userId],
    );

    return mapWallet(result.rows[0]);
  }

  async getWallet(userId: string): Promise<Wallet> {
    ensureNonEmptyString(userId, 'userId');

    const result = await this.pool.query<WalletRow>('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    const wallet = result.rows[0];

    if (!wallet) {
      throw new AppError(404, 'Wallet not found.');
    }

    return mapWallet(wallet);
  }

  async getWalletLedger(userId: string): Promise<LedgerEntry[]> {
    const wallet = await this.getWallet(userId);
    const result = await this.pool.query<LedgerRow>(
      'SELECT * FROM ledger_entries WHERE wallet_id = $1 ORDER BY created_at DESC',
      [wallet.id],
    );

    return result.rows.map(mapLedgerEntry);
  }

  async startDeposit(input: DepositIntentInput): Promise<ApiResponse<{ transaction: Transaction; wallet: Wallet }>> {
    ensureNonEmptyString(input.userId, 'userId');
    ensureNonEmptyString(input.idempotencyKey, 'idempotencyKey');
    ensurePositiveAmount(input.amount);

    const requestHash = hashPayload(input);
    const existingIdempotency = await this.pool.query<IdempotencyRow>(
      'SELECT * FROM idempotency_keys WHERE scope = $1 AND key = $2',
      ['deposit', input.idempotencyKey],
    );

    const existingRecord = existingIdempotency.rows[0];
    if (existingRecord) {
      if (existingRecord.request_hash !== requestHash) {
        throw new AppError(409, 'Idempotency key reuse detected with a different payload.');
      }

      return existingRecord.response as ApiResponse<{ transaction: Transaction; wallet: Wallet }>;
    }

    const wallet = await this.createWallet(input.userId);
    const transactionResult = await this.pool.query<TransactionRow>(
      `
      INSERT INTO transactions (
        id, reference, type, status, amount, from_wallet_id, to_wallet_id,
        user_id, idempotency_key, metadata, created_at, updated_at
      )
      VALUES ($1, $2, 'deposit', 'pending', $3, NULL, $4, $5, $6, $7::jsonb, now(), now())
      RETURNING *
      `,
      [
        randomUUID(),
        this.nextReference('dep'),
        roundMoney(input.amount),
        wallet.id,
        input.userId,
        input.idempotencyKey,
        JSON.stringify({ channel: 'paystack', initiatedAt: now() }),
      ],
    );

    const response: ApiResponse<{ transaction: Transaction; wallet: Wallet }> = {
      data: {
        transaction: mapTransaction(transactionResult.rows[0]),
        wallet,
      },
    };

    await this.pool.query(
      'INSERT INTO idempotency_keys (key, scope, request_hash, response, created_at) VALUES ($1, $2, $3, $4::jsonb, now())',
      [input.idempotencyKey, 'deposit', requestHash, JSON.stringify(response)],
    );

    return response;
  }

  async completeDeposit(reference: string, event: WebhookEvent): Promise<Transaction> {
    ensureNonEmptyString(reference, 'reference');
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const txResult = await client.query<TransactionRow>(
        'SELECT * FROM transactions WHERE reference = $1 FOR UPDATE',
        [reference],
      );
      const transaction = txResult.rows[0];

      if (!transaction) {
        throw new AppError(404, 'Deposit transaction not found for the provided reference.');
      }

      if (transaction.status === 'completed') {
        await client.query('COMMIT');
        return mapTransaction(transaction);
      }

      const userWalletResult = await client.query<WalletRow>('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [
        transaction.user_id,
      ]);
      const userWallet = userWalletResult.rows[0];

      if (!userWallet) {
        throw new AppError(404, 'Wallet not found.');
      }

      await client.query(
        `
        INSERT INTO wallets (id, user_id, currency, balance, status, created_at, updated_at)
        VALUES ($1, $2, 'NGN', 0, 'active', now(), now())
        ON CONFLICT (user_id) DO NOTHING
        `,
        [randomUUID(), SYSTEM_CLEARING_USER_ID],
      );

      const settlementResult = await client.query<WalletRow>('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [
        SYSTEM_CLEARING_USER_ID,
      ]);
      const settlementWallet = settlementResult.rows[0];

      if (!settlementWallet) {
        throw new AppError(500, 'Settlement wallet missing.');
      }

      const amount = roundMoney(event.data.amount ? event.data.amount / 100 : Number(transaction.amount));
      const userNextBalance = roundMoney(Number(userWallet.balance) + amount);
      const settlementNextBalance = roundMoney(Number(settlementWallet.balance) - amount);

      await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [
        userNextBalance,
        userWallet.id,
      ]);
      await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [
        settlementNextBalance,
        settlementWallet.id,
      ]);

      await client.query(
        `
        INSERT INTO ledger_entries (id, transaction_id, wallet_id, direction, amount, running_balance, created_at)
        VALUES
          ($1, $2, $3, 'debit', $4, $5, now()),
          ($6, $2, $7, 'credit', $4, $8, now())
        `,
        [
          randomUUID(),
          transaction.id,
          settlementWallet.id,
          amount,
          settlementNextBalance,
          randomUUID(),
          userWallet.id,
          userNextBalance,
        ],
      );

      const metadataPatch = JSON.stringify({
        source: 'paystack-webhook',
        settledAt: now(),
        paystackReference: reference,
      });

      const updatedTxResult = await client.query<TransactionRow>(
        `
        UPDATE transactions
        SET status = 'completed',
            amount = $2,
            metadata = metadata || $3::jsonb,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [transaction.id, amount, metadataPatch],
      );

      await client.query('COMMIT');
      return mapTransaction(updatedTxResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async transfer(input: TransferInput): Promise<ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }>> {
    ensureNonEmptyString(input.senderUserId, 'senderUserId');
    ensureNonEmptyString(input.recipientUserId, 'recipientUserId');
    ensureNonEmptyString(input.idempotencyKey, 'idempotencyKey');
    ensurePositiveAmount(input.amount);

    if (input.senderUserId === input.recipientUserId) {
      throw new AppError(400, 'Sender and recipient must be different users.');
    }

    const requestHash = hashPayload(input);
    const existingIdempotency = await this.pool.query<IdempotencyRow>(
      'SELECT * FROM idempotency_keys WHERE scope = $1 AND key = $2',
      ['transfer', input.idempotencyKey],
    );
    const existingRecord = existingIdempotency.rows[0];

    if (existingRecord) {
      if (existingRecord.request_hash !== requestHash) {
        throw new AppError(409, 'Idempotency key reuse detected with a different payload.');
      }

      return existingRecord.response as ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }>;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `
        INSERT INTO wallets (id, user_id, currency, balance, status, created_at, updated_at)
        VALUES ($1, $2, 'NGN', 0, 'active', now(), now())
        ON CONFLICT (user_id) DO NOTHING
        `,
        [randomUUID(), input.recipientUserId],
      );

      const orderedIds = [input.senderUserId, input.recipientUserId].sort();
      const walletsResult = await client.query<WalletRow>(
        'SELECT * FROM wallets WHERE user_id = ANY($1::text[]) ORDER BY user_id FOR UPDATE',
        [orderedIds],
      );

      const senderWallet = walletsResult.rows.find((row: WalletRow) => row.user_id === input.senderUserId);
      const recipientWallet = walletsResult.rows.find((row: WalletRow) => row.user_id === input.recipientUserId);

      if (!senderWallet) {
        throw new AppError(404, 'Wallet not found.');
      }

      if (!recipientWallet) {
        throw new AppError(500, 'Recipient wallet could not be created.');
      }

      const amount = roundMoney(input.amount);
      if (Number(senderWallet.balance) < amount) {
        throw new AppError(400, 'Insufficient balance.');
      }

      const senderNextBalance = roundMoney(Number(senderWallet.balance) - amount);
      const recipientNextBalance = roundMoney(Number(recipientWallet.balance) + amount);

      const transactionResult = await client.query<TransactionRow>(
        `
        INSERT INTO transactions (
          id, reference, type, status, amount, from_wallet_id, to_wallet_id,
          user_id, idempotency_key, metadata, created_at, updated_at
        )
        VALUES ($1, $2, 'transfer', 'completed', $3, $4, $5, $6, $7, $8::jsonb, now(), now())
        RETURNING *
        `,
        [
          randomUUID(),
          this.nextReference('trf'),
          amount,
          senderWallet.id,
          recipientWallet.id,
          senderWallet.user_id,
          input.idempotencyKey,
          JSON.stringify({ recipientUserId: input.recipientUserId }),
        ],
      );

      const transaction = transactionResult.rows[0];

      await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [
        senderNextBalance,
        senderWallet.id,
      ]);
      await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [
        recipientNextBalance,
        recipientWallet.id,
      ]);

      await client.query(
        `
        INSERT INTO ledger_entries (id, transaction_id, wallet_id, direction, amount, running_balance, created_at)
        VALUES
          ($1, $2, $3, 'debit', $4, $5, now()),
          ($6, $2, $7, 'credit', $4, $8, now())
        `,
        [
          randomUUID(),
          transaction.id,
          senderWallet.id,
          amount,
          senderNextBalance,
          randomUUID(),
          recipientWallet.id,
          recipientNextBalance,
        ],
      );

      const response: ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }> = {
        data: {
          transaction: mapTransaction(transaction),
          senderWallet: {
            ...mapWallet(senderWallet),
            balance: senderNextBalance,
            updatedAt: now(),
          },
          recipientWallet: {
            ...mapWallet(recipientWallet),
            balance: recipientNextBalance,
            updatedAt: now(),
          },
        },
      };

      await client.query(
        'INSERT INTO idempotency_keys (key, scope, request_hash, response, created_at) VALUES ($1, $2, $3, $4::jsonb, now())',
        [input.idempotencyKey, 'transfer', requestHash, JSON.stringify(response)],
      );

      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listTransactions(userId: string): Promise<ApiResponse<Transaction[]>> {
    ensureNonEmptyString(userId, 'userId');

    const result = await this.pool.query<TransactionRow>(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return {
      data: result.rows.map(mapTransaction),
    };
  }

  async getTransactionByReference(reference: string): Promise<Transaction> {
    ensureNonEmptyString(reference, 'reference');

    const result = await this.pool.query<TransactionRow>('SELECT * FROM transactions WHERE reference = $1', [reference]);
    const transaction = result.rows[0];

    if (!transaction) {
      throw new AppError(404, 'Transaction not found.');
    }

    return mapTransaction(transaction);
  }

  verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): PaystackVerificationResult {
    if (!signature) {
      return { valid: false, reason: 'Missing x-paystack-signature header.' };
    }

    const expectedSignature = createHmac('sha512', this.paystackSecretKey).update(rawBody).digest('hex');

    if (expectedSignature !== signature) {
      return { valid: false, reason: 'Invalid Paystack signature.' };
    }

    return { valid: true };
  }

  async handlePaystackWebhook(event: WebhookEvent): Promise<ApiResponse<{ transaction: Transaction }>> {
    if (event.event !== 'charge.success') {
      throw new AppError(400, 'Unsupported Paystack event.');
    }

    const reference = event.data.reference;

    if (!reference) {
      throw new AppError(400, 'Webhook payload is missing a transaction reference.');
    }

    const transaction = await this.completeDeposit(reference, event);

    return {
      data: {
        transaction,
      },
    };
  }

  async seedSettlementAccount(): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO wallets (id, user_id, currency, balance, status, created_at, updated_at)
      VALUES ($1, $2, 'NGN', 0, 'active', now(), now())
      ON CONFLICT (user_id) DO NOTHING
      `,
      [randomUUID(), SYSTEM_CLEARING_USER_ID],
    );
  }

  private nextReference(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}