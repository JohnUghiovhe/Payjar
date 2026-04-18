import { randomUUID } from 'crypto';

import {
  IdempotencyRecord,
  LedgerEntry,
  Transaction,
  Wallet,
} from './domain';

const now = () => new Date().toISOString();

export class InMemoryStore {
  private readonly walletsById = new Map<string, Wallet>();

  private readonly walletIdsByUserId = new Map<string, string>();

  private readonly transactionsById = new Map<string, Transaction>();

  private readonly transactionsByReference = new Map<string, string>();

  private readonly ledgerEntries: LedgerEntry[] = [];

  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();

  createWallet(userId: string, currency: Wallet['currency']): Wallet {
    const existingWallet = this.getWalletByUserId(userId);

    if (existingWallet) {
      return existingWallet;
    }

    const wallet: Wallet = {
      id: randomUUID(),
      userId,
      currency,
      balance: 0,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    };

    this.walletsById.set(wallet.id, wallet);
    this.walletIdsByUserId.set(userId, wallet.id);

    return wallet;
  }

  getWalletByUserId(userId: string): Wallet | null {
    const walletId = this.walletIdsByUserId.get(userId);

    if (!walletId) {
      return null;
    }

    return this.walletsById.get(walletId) ?? null;
  }

  getWalletById(walletId: string): Wallet | null {
    return this.walletsById.get(walletId) ?? null;
  }

  saveWallet(wallet: Wallet): void {
    this.walletsById.set(wallet.id, wallet);
    this.walletIdsByUserId.set(wallet.userId, wallet.id);
  }

  saveTransaction(transaction: Transaction): void {
    this.transactionsById.set(transaction.id, transaction);
    this.transactionsByReference.set(transaction.reference, transaction.id);
  }

  getTransactionById(transactionId: string): Transaction | null {
    return this.transactionsById.get(transactionId) ?? null;
  }

  getTransactionByReference(reference: string): Transaction | null {
    const transactionId = this.transactionsByReference.get(reference);

    if (!transactionId) {
      return null;
    }

    return this.transactionsById.get(transactionId) ?? null;
  }

  listTransactionsForUser(userId: string): Transaction[] {
    return [...this.transactionsById.values()]
      .filter(transaction => transaction.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  addLedgerEntries(entries: LedgerEntry[]): void {
    this.ledgerEntries.push(...entries);
  }

  getLedgerEntriesForWallet(walletId: string): LedgerEntry[] {
    return this.ledgerEntries
      .filter(entry => entry.walletId === walletId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  findIdempotencyRecord(scope: string, key: string): IdempotencyRecord | null {
    return this.idempotencyRecords.get(`${scope}:${key}`) ?? null;
  }

  saveIdempotencyRecord(record: IdempotencyRecord): void {
    this.idempotencyRecords.set(`${record.scope}:${record.key}`, record);
  }

  nextReference(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}