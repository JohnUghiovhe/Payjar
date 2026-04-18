import { createHmac, randomUUID } from 'crypto';

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
import { InMemoryStore } from './store';

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

export class WalletService {
  constructor(private readonly store: InMemoryStore, private readonly paystackSecretKey: string) {}

  createWallet(userId: string): Wallet {
    ensureNonEmptyString(userId, 'userId');
    return this.store.createWallet(userId, 'NGN');
  }

  getWallet(userId: string): Wallet {
    const wallet = this.store.getWalletByUserId(userId);

    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    return wallet;
  }

  startDeposit(input: DepositIntentInput): ApiResponse<{ transaction: Transaction; wallet: Wallet }> {
    ensureNonEmptyString(input.userId, 'userId');
    ensureNonEmptyString(input.idempotencyKey, 'idempotencyKey');
    ensurePositiveAmount(input.amount);

    const requestHash = hashPayload(input);
    const idempotencyRecord = this.store.findIdempotencyRecord('deposit', input.idempotencyKey);

    if (idempotencyRecord) {
      if (idempotencyRecord.requestHash !== requestHash) {
        throw new Error('Idempotency key reuse detected with a different payload.');
      }

      return idempotencyRecord.response as ApiResponse<{ transaction: Transaction; wallet: Wallet }>;
    }

    const wallet = this.store.createWallet(input.userId, 'NGN');
    const transaction: Transaction = {
      id: randomUUID(),
      reference: this.store.nextReference('dep'),
      type: 'deposit',
      status: 'pending',
      amount: roundMoney(input.amount),
      fromWalletId: null,
      toWalletId: wallet.id,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        channel: 'paystack',
        initiatedAt: now(),
      },
      createdAt: now(),
      updatedAt: now(),
    };

    this.store.saveTransaction(transaction);

    const response: ApiResponse<{ transaction: Transaction; wallet: Wallet }> = {
      data: {
        transaction,
        wallet,
      },
    };

    this.store.saveIdempotencyRecord({
      key: input.idempotencyKey,
      scope: 'deposit',
      requestHash,
      response,
      createdAt: now(),
    });

    return response;
  }

  completeDeposit(reference: string, event: WebhookEvent): Transaction {
    ensureNonEmptyString(reference, 'reference');

    const transaction = this.store.getTransactionByReference(reference);

    if (!transaction) {
      throw new Error('Deposit transaction not found for the provided reference.');
    }

    if (transaction.status === 'completed') {
      return transaction;
    }

    const wallet = this.getWallet(transaction.userId);
    const settlementWallet = this.store.createWallet(SYSTEM_CLEARING_USER_ID, 'NGN');
    const amount = roundMoney(event.data.amount ? event.data.amount / 100 : transaction.amount);

    this.postDoubleEntry({
      transaction,
      creditWalletId: wallet.id,
      debitWalletId: settlementWallet.id,
      amount,
      transactionType: 'deposit',
      metadata: {
        source: 'paystack-webhook',
        event,
      },
    });

    return this.finalizeTransaction(transaction.id, 'completed', {
      settledAt: now(),
      paystackReference: reference,
    });
  }

  transfer(input: TransferInput): ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }> {
    ensureNonEmptyString(input.senderUserId, 'senderUserId');
    ensureNonEmptyString(input.recipientUserId, 'recipientUserId');
    ensureNonEmptyString(input.idempotencyKey, 'idempotencyKey');
    ensurePositiveAmount(input.amount);

    if (input.senderUserId === input.recipientUserId) {
      throw new Error('Sender and recipient must be different users.');
    }

    const requestHash = hashPayload(input);
    const idempotencyRecord = this.store.findIdempotencyRecord('transfer', input.idempotencyKey);

    if (idempotencyRecord) {
      if (idempotencyRecord.requestHash !== requestHash) {
        throw new Error('Idempotency key reuse detected with a different payload.');
      }

      return idempotencyRecord.response as ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }>;
    }

    const senderWallet = this.getWallet(input.senderUserId);
    const recipientWallet = this.store.createWallet(input.recipientUserId, 'NGN');
    const amount = roundMoney(input.amount);

    if (senderWallet.balance < amount) {
      throw new Error('Insufficient balance.');
    }

    const transaction: Transaction = {
      id: randomUUID(),
      reference: this.store.nextReference('trf'),
      type: 'transfer',
      status: 'completed',
      amount,
      fromWalletId: senderWallet.id,
      toWalletId: recipientWallet.id,
      userId: input.senderUserId,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        recipientUserId: input.recipientUserId,
      },
      createdAt: now(),
      updatedAt: now(),
    };

    this.postDoubleEntry({
      transaction,
      creditWalletId: recipientWallet.id,
      debitWalletId: senderWallet.id,
      amount,
      transactionType: 'transfer',
      metadata: {
        recipientUserId: input.recipientUserId,
      },
    });

    this.store.saveTransaction(transaction);

    const response: ApiResponse<{ transaction: Transaction; senderWallet: Wallet; recipientWallet: Wallet }> = {
      data: {
        transaction,
        senderWallet: this.getWallet(input.senderUserId),
        recipientWallet: this.getWallet(input.recipientUserId),
      },
    };

    this.store.saveIdempotencyRecord({
      key: input.idempotencyKey,
      scope: 'transfer',
      requestHash,
      response,
      createdAt: now(),
    });

    return response;
  }

  listTransactions(userId: string): ApiResponse<Transaction[]> {
    ensureNonEmptyString(userId, 'userId');

    return {
      data: this.store.listTransactionsForUser(userId),
    };
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

  handlePaystackWebhook(event: WebhookEvent): ApiResponse<{ transaction: Transaction }> {
    if (event.event !== 'charge.success') {
      throw new Error('Unsupported Paystack event.');
    }

    const reference = event.data.reference;

    if (!reference) {
      throw new Error('Webhook payload is missing a transaction reference.');
    }

    const transaction = this.completeDeposit(reference, event);

    return {
      data: {
        transaction,
      },
    };
  }

  seedSettlementAccount(): void {
    this.store.createWallet(SYSTEM_CLEARING_USER_ID, 'NGN');
  }

  private finalizeTransaction(transactionId: string, status: Transaction['status'], metadata: Record<string, unknown>): Transaction {
    const transaction = this.store.getTransactionById(transactionId);

    if (!transaction) {
      throw new Error('Transaction not found.');
    }

    const updatedTransaction: Transaction = {
      ...transaction,
      status,
      metadata: {
        ...transaction.metadata,
        ...metadata,
      },
      updatedAt: now(),
    };

    this.store.saveTransaction(updatedTransaction);

    return updatedTransaction;
  }

  private postDoubleEntry(params: {
    transaction: Transaction;
    creditWalletId: string | null;
    debitWalletId: string | null;
    amount: number;
    transactionType: Transaction['type'];
    metadata: Record<string, unknown>;
  }): void {
    const entries: LedgerEntry[] = [];

    if (params.debitWalletId) {
      const wallet = this.store.getWalletById(params.debitWalletId);

      if (!wallet) {
        throw new Error('Debit wallet not found.');
      }

      const updatedWallet: Wallet = {
        ...wallet,
        balance: roundMoney(wallet.balance - params.amount),
        updatedAt: now(),
      };

      this.store.saveWallet(updatedWallet);
      entries.push({
        id: randomUUID(),
        transactionId: params.transaction.id,
        walletId: wallet.id,
        direction: 'debit',
        amount: params.amount,
        runningBalance: updatedWallet.balance,
        createdAt: now(),
      });
    } else {
      entries.push({
        id: randomUUID(),
        transactionId: params.transaction.id,
        walletId: null,
        direction: 'debit',
        amount: params.amount,
        runningBalance: null,
        createdAt: now(),
      });
    }

    if (params.creditWalletId) {
      const wallet = this.store.getWalletById(params.creditWalletId);

      if (!wallet) {
        throw new Error('Credit wallet not found.');
      }

      const updatedWallet: Wallet = {
        ...wallet,
        balance: roundMoney(wallet.balance + params.amount),
        updatedAt: now(),
      };

      this.store.saveWallet(updatedWallet);
      entries.push({
        id: randomUUID(),
        transactionId: params.transaction.id,
        walletId: wallet.id,
        direction: 'credit',
        amount: params.amount,
        runningBalance: updatedWallet.balance,
        createdAt: now(),
      });
    } else {
      entries.push({
        id: randomUUID(),
        transactionId: params.transaction.id,
        walletId: null,
        direction: 'credit',
        amount: params.amount,
        runningBalance: null,
        createdAt: now(),
      });
    }

    this.store.addLedgerEntries(entries);

    this.store.saveTransaction({
      ...params.transaction,
      metadata: {
        ...params.transaction.metadata,
        ...params.metadata,
        transactionType: params.transactionType,
      },
      updatedAt: now(),
    });
  }
}