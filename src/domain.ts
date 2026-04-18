export type CurrencyCode = 'NGN';

export type WalletStatus = 'active' | 'suspended';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';
export type TransactionType = 'deposit' | 'transfer';
export type LedgerDirection = 'debit' | 'credit';

export interface Wallet {
  id: string;
  userId: string;
  currency: CurrencyCode;
  balance: number;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  fromWalletId: string | null;
  toWalletId: string | null;
  userId: string;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  walletId: string | null;
  direction: LedgerDirection;
  amount: number;
  runningBalance: number | null;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  scope: string;
  requestHash: string;
  response: unknown;
  createdAt: string;
}

export interface CreateWalletInput {
  userId: string;
  currency?: CurrencyCode;
}

export interface TransferInput {
  senderUserId: string;
  recipientUserId: string;
  amount: number;
  idempotencyKey: string;
}

export interface DepositIntentInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
}

export interface WebhookEvent {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    status?: string;
    metadata?: {
      userId?: string;
    };
  };
}

export interface PaystackVerificationResult {
  valid: boolean;
  reason?: string;
}

export interface ApiResponse<T> {
  data: T;
}