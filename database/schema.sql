-- PAYJAR database schema.
--
-- This file is applied at application startup for the current development
-- workflow and is also loaded by the pg-mem test suite. Keep it compatible
-- with both PostgreSQL and pg-mem.
--
-- PostgreSQL-only hardening that pg-mem cannot parse or handle safely
-- (period overlap exclusion and partial unique indexes on composite-FK
-- parent tables) lives in database/schema.postgres.sql.
--
-- Legacy wallet/payment tables are retained unchanged below. Budgeting
-- records reference users, never wallets.

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

-- ---------------------------------------------------------------------------
-- Budgeting domain
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  auth_subject text NOT NULL UNIQUE,
  email text NULL,
  phone text NULL,
  display_name text NOT NULL CHECK (display_name <> ''),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  timezone text NOT NULL DEFAULT 'Africa/Lagos' CHECK (timezone <> ''),
  week_starts_on smallint NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name <> ''),
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  timezone text NOT NULL CHECK (timezone <> ''),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id)
);

-- One active budget per user is enforced by budgets_one_active_per_user in
-- database/schema.postgres.sql. It lives there because pg-mem cannot safely
-- update a composite-FK parent row after it leaves a partial unique index.

CREATE INDEX IF NOT EXISTS idx_budgets_user_status ON budgets (user_id, status);

CREATE TABLE IF NOT EXISTS budget_periods (
  id uuid PRIMARY KEY,
  budget_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  name text NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  timezone text NOT NULL CHECK (timezone <> ''),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  opening_unallocated_kobo bigint NOT NULL DEFAULT 0,
  closing_unallocated_kobo bigint NULL,
  total_income_kobo bigint NULL CHECK (total_income_kobo IS NULL OR total_income_kobo >= 0),
  total_expense_kobo bigint NULL,
  total_allocated_kobo bigint NULL CHECK (total_allocated_kobo IS NULL OR total_allocated_kobo >= 0),
  total_released_kobo bigint NULL CHECK (total_released_kobo IS NULL OR total_released_kobo >= 0),
  total_carried_kobo bigint NULL,
  total_shortfall_kobo bigint NULL CHECK (total_shortfall_kobo IS NULL OR total_shortfall_kobo >= 0),
  closed_at timestamptz NULL,
  closed_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  reopened_at timestamptz NULL,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  UNIQUE (id, budget_id),
  UNIQUE (id, budget_id, user_id),
  UNIQUE (budget_id, sequence),
  UNIQUE (budget_id, starts_on),
  FOREIGN KEY (budget_id, user_id) REFERENCES budgets (id, user_id) ON DELETE RESTRICT,
  CHECK (ends_on >= starts_on),
  CHECK (closed_by IS NULL OR closed_at IS NOT NULL),
  CHECK (
    (status = 'closed'
      AND closing_unallocated_kobo IS NOT NULL
      AND total_income_kobo IS NOT NULL
      AND total_expense_kobo IS NOT NULL
      AND total_allocated_kobo IS NOT NULL
      AND total_released_kobo IS NOT NULL
      AND total_carried_kobo IS NOT NULL
      AND total_shortfall_kobo IS NOT NULL)
    OR
    (status <> 'closed'
      AND closing_unallocated_kobo IS NULL
      AND total_income_kobo IS NULL
      AND total_expense_kobo IS NULL
      AND total_allocated_kobo IS NULL
      AND total_released_kobo IS NULL
      AND total_carried_kobo IS NULL
      AND total_shortfall_kobo IS NULL)
  )
);

-- One active period per budget is enforced by
-- budget_periods_one_active_per_budget in database/schema.postgres.sql.

CREATE INDEX IF NOT EXISTS idx_budget_periods_budget_starts
  ON budget_periods (budget_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS idx_budget_periods_user_status
  ON budget_periods (user_id, status);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name <> ''),
  icon_key text NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id),
  CHECK (is_system = (user_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_system_name_unique
  ON categories (lower(name))
  WHERE user_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_unique
  ON categories (user_id, lower(name))
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories (user_id);

CREATE TABLE IF NOT EXISTS jars (
  id uuid PRIMARY KEY,
  budget_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (name <> ''),
  kind text NOT NULL CHECK (kind IN ('savings', 'standard')),
  rollover_policy text NOT NULL CHECK (rollover_policy IN ('carry_forward', 'release_to_general_pool')),
  category_id uuid NULL REFERENCES categories(id) ON DELETE RESTRICT,
  target_kobo bigint NULL CHECK (target_kobo IS NULL OR target_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id),
  UNIQUE (id, budget_id),
  UNIQUE (id, budget_id, user_id),
  FOREIGN KEY (budget_id, user_id) REFERENCES budgets (id, user_id) ON DELETE RESTRICT
);

-- Jar name and category uniqueness are enforced by
-- jars_name_unique_per_budget and jars_category_unique_per_budget in
-- database/schema.postgres.sql.

CREATE INDEX IF NOT EXISTS idx_jars_budget_sort ON jars (budget_id, sort_order);

CREATE TABLE IF NOT EXISTS jar_allocations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  period_id uuid NOT NULL,
  jar_id uuid NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  note text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, jar_id),
  FOREIGN KEY (period_id, budget_id, user_id)
    REFERENCES budget_periods (id, budget_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (jar_id, budget_id, user_id)
    REFERENCES jars (id, budget_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_jar_allocations_period ON jar_allocations (period_id);
CREATE INDEX IF NOT EXISTS idx_jar_allocations_jar_period ON jar_allocations (jar_id, period_id);

CREATE TABLE IF NOT EXISTS income_sources (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name <> ''),
  source_type text NOT NULL CHECK (source_type IN ('salary', 'business', 'freelance', 'gift', 'other')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id)
);

-- Income source name uniqueness is enforced by
-- income_sources_name_unique_per_user in database/schema.postgres.sql.

CREATE INDEX IF NOT EXISTS idx_income_sources_user_active ON income_sources (user_id, active);

CREATE TABLE IF NOT EXISTS income_entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_period_id uuid NOT NULL,
  income_source_id uuid NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  status text NOT NULL CHECK (status IN ('expected', 'received', 'cancelled')),
  expected_on date NULL,
  received_at timestamptz NULL,
  note text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  FOREIGN KEY (budget_period_id, user_id)
    REFERENCES budget_periods (id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (income_source_id, user_id)
    REFERENCES income_sources (id, user_id) ON DELETE RESTRICT,
  CHECK ((status <> 'received') OR received_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_income_entries_user_received
  ON income_entries (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_income_entries_period_status
  ON income_entries (budget_period_id, status);
CREATE INDEX IF NOT EXISTS idx_income_entries_source
  ON income_entries (income_source_id);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_period_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  jar_id uuid NULL,
  entry_type text NOT NULL DEFAULT 'expense' CHECK (entry_type IN ('expense', 'refund')),
  adjusts_expense_id uuid NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  merchant text NULL,
  note text NULL,
  payment_method text NULL,
  occurred_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'imported')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (budget_period_id, user_id)
    REFERENCES budget_periods (id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (jar_id, user_id)
    REFERENCES jars (id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (adjusts_expense_id, user_id)
    REFERENCES expenses (id, user_id) ON DELETE RESTRICT,
  CHECK ((entry_type = 'refund') = (adjusts_expense_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_occurred
  ON expenses (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_category_occurred
  ON expenses (user_id, category_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_period_jar
  ON expenses (budget_period_id, jar_id);
CREATE INDEX IF NOT EXISTS idx_expenses_jar ON expenses (jar_id);

CREATE TABLE IF NOT EXISTS commitments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_period_id uuid NOT NULL,
  name text NOT NULL CHECK (name <> ''),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid', 'cancelled')),
  recurrence_rule text NULL,
  paid_at timestamptz NULL,
  settled_expense_id uuid NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (budget_period_id, user_id)
    REFERENCES budget_periods (id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (settled_expense_id, user_id)
    REFERENCES expenses (id, user_id) ON DELETE RESTRICT,
  CHECK ((status <> 'paid') OR paid_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS commitments_settled_expense_unique
  ON commitments (settled_expense_id)
  WHERE settled_expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_user_due_status
  ON commitments (user_id, due_on, status);
CREATE INDEX IF NOT EXISTS idx_commitments_period_status
  ON commitments (budget_period_id, status);

CREATE TABLE IF NOT EXISTS period_jar_summaries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  period_id uuid NOT NULL,
  jar_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  opening_balance_kobo bigint NOT NULL,
  allocated_kobo bigint NOT NULL CHECK (allocated_kobo >= 0),
  spent_kobo bigint NOT NULL,
  closing_balance_kobo bigint NOT NULL,
  rollover_policy text NOT NULL CHECK (rollover_policy IN ('carry_forward', 'release_to_general_pool')),
  carried_forward_kobo bigint NOT NULL,
  released_to_general_pool_kobo bigint NOT NULL CHECK (released_to_general_pool_kobo >= 0),
  shortfall_kobo bigint NOT NULL CHECK (shortfall_kobo >= 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz NULL,
  superseded_by_id uuid NULL REFERENCES period_jar_summaries(id) ON DELETE RESTRICT,
  UNIQUE (period_id, jar_id, revision),
  FOREIGN KEY (period_id, budget_id, user_id)
    REFERENCES budget_periods (id, budget_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (jar_id, budget_id, user_id)
    REFERENCES jars (id, budget_id, user_id) ON DELETE RESTRICT,
  CHECK (carried_forward_kobo = closing_balance_kobo - released_to_general_pool_kobo),
  CHECK (shortfall_kobo = GREATEST(0, -closing_balance_kobo))
);

CREATE UNIQUE INDEX IF NOT EXISTS period_jar_summaries_current
  ON period_jar_summaries (period_id, jar_id)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_period_jar_summaries_period
  ON period_jar_summaries (period_id);
CREATE INDEX IF NOT EXISTS idx_period_jar_summaries_jar_period
  ON period_jar_summaries (jar_id, period_id DESC);

CREATE TABLE IF NOT EXISTS rollover_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  period_id uuid NOT NULL,
  jar_id uuid NULL,
  scope text NOT NULL CHECK (scope IN ('jar', 'general_pool')),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  policy text NULL CHECK (policy IS NULL OR policy IN ('carry_forward', 'release_to_general_pool')),
  closing_balance_kobo bigint NOT NULL,
  carried_forward_kobo bigint NOT NULL,
  released_to_general_pool_kobo bigint NOT NULL CHECK (released_to_general_pool_kobo >= 0),
  shortfall_kobo bigint NOT NULL CHECK (shortfall_kobo >= 0),
  next_period_id uuid NULL,
  superseded_at timestamptz NULL,
  superseded_by_id uuid NULL REFERENCES rollover_records(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (period_id, budget_id, user_id)
    REFERENCES budget_periods (id, budget_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (next_period_id, budget_id, user_id)
    REFERENCES budget_periods (id, budget_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (jar_id, budget_id, user_id)
    REFERENCES jars (id, budget_id, user_id) ON DELETE RESTRICT,
  CHECK ((scope = 'jar') = (jar_id IS NOT NULL)),
  CHECK ((scope = 'general_pool') = (policy IS NULL)),
  CHECK (carried_forward_kobo = closing_balance_kobo - released_to_general_pool_kobo),
  CHECK (shortfall_kobo = GREATEST(0, -closing_balance_kobo))
);

CREATE UNIQUE INDEX IF NOT EXISTS rollover_records_jar_revision
  ON rollover_records (period_id, jar_id, revision)
  WHERE scope = 'jar';
CREATE UNIQUE INDEX IF NOT EXISTS rollover_records_general_revision
  ON rollover_records (period_id, revision)
  WHERE scope = 'general_pool';
CREATE UNIQUE INDEX IF NOT EXISTS rollover_records_current_jar
  ON rollover_records (period_id, jar_id)
  WHERE scope = 'jar' AND superseded_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rollover_records_current_general
  ON rollover_records (period_id)
  WHERE scope = 'general_pool' AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rollover_records_period ON rollover_records (period_id);
CREATE INDEX IF NOT EXISTS idx_rollover_records_budget_revision ON rollover_records (budget_id, revision);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type <> ''),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action <> ''),
  before_state jsonb NULL,
  after_state jsonb NULL,
  reason text NULL,
  request_id text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_type = 'user') = (actor_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_occurred
  ON audit_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_occurred
  ON audit_events (entity_type, entity_id, occurred_at DESC);
