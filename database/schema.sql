CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'NGN',
  balance numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('deposit', 'transfer')),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  from_wallet_id uuid NULL REFERENCES wallets(id),
  to_wallet_id uuid NULL REFERENCES wallets(id),
  user_id text NOT NULL,
  idempotency_key text NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  wallet_id uuid NULL REFERENCES wallets(id),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  running_balance numeric(18,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text NOT NULL,
  scope text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id_created_at ON transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id_created_at ON ledger_entries (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries (transaction_id);