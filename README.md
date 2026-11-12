# PayJar

PayJar is a backend-driven wallet and transaction system built around double-entry accounting, idempotent writes, and secure Paystack webhook verification.

## Major updates

- Service logic now persists directly to PostgreSQL via `pg`.
- Financial mutations run inside SQL transactions for consistency.
- Request validation is enforced with `zod`.
- Swagger documentation is available at `/docs` and `/openapi.json`.
- API tests now run with Jest + Supertest + pg-mem.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Environment variables

Create an `.env` file with the following values:

```bash
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payjar
PAYSTACK_SECRET_KEY=your_paystack_secret
PAYSTACK_PUBLIC_KEY=your_paystack_public_key
```

## Run locally

```bash
npm install
npm run build
npm start
```

The server applies pending migrations from `database/migrations` at startup
before serving traffic.

## Database schema and migrations

Schema changes live in `database/migrations`. Each migration runs once and is
recorded in the `schema_migrations` table with its id, SHA-256 checksum, and
applied timestamp.

Migration files use a zero-padded numeric prefix:

- `NNN_description.sql` — portable SQL that runs on PostgreSQL and pg-mem.
- `NNN_description.postgres.sql` — optional PostgreSQL-only add-on. The runner
  applies it after the portable file in the same transaction when PostgreSQL
  features are enabled.

`001_initial_schema.sql` creates the wallet tables and the budgeting tables
(`users`, `budgets`, `budget_periods`, `categories`, `jars`, `jar_allocations`,
`income_sources`, `income_entries`, `expenses`, `commitments`,
`period_jar_summaries`, `rollover_records`, and `audit_events`).
`001_initial_schema.postgres.sql` adds the `btree_gist` extension, the
`budget_periods_no_overlap` exclusion constraint, and the partial unique indexes
for one active budget per user, one active period per budget, unique budget/jar
and income-source names, and one jar per category per budget.

Kobo amounts are stored as `BIGINT`. Ownership is enforced with composite foreign
keys so a period, jar, allocation, expense, summary, or rollover row cannot
reference another user's or another budget's record. Invalid amounts, statuses,
dates, and close snapshots are rejected by `CHECK` constraints.

### Run migrations

Build the project first, then run the migration command:

```bash
npm run build
npm run migrate
```

`npm start` also applies pending migrations during startup. The migration runner
uses a PostgreSQL advisory lock so concurrent application instances do not apply
the same migration twice. The `CREATE EXTENSION` statement requires a role that
can install extensions, or an administrator can install `btree_gist` first.

To create a clean local database from scratch:

```bash
createdb payjar
npm run migrate
```

### Existing databases

The first migration is safe to apply to an existing database: it uses
`CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so existing
wallet rows are preserved. The first successful run records the baseline in
`schema_migrations`.

### Failed migrations and immutability

- Each migration runs inside its own transaction. If it fails, it is rolled back,
  no tracking row is written, and later migrations are not attempted.
- Earlier successful migrations remain applied. Fix the failing migration and run
  the command again.
- Never edit a migration that has already been applied. The runner rejects
  checksum changes; create a new numbered migration instead.
- Do not put `BEGIN`, `COMMIT`, or `CREATE INDEX CONCURRENTLY` inside a migration
  file. The runner manages the transaction.
- Back up production data before running a migration that changes large tables.

## Budgeting repositories

Budgeting data access lives in `src/repositories/budgeting`. Repositories own all
SQL, use parameterised queries, and accept either a `Pool` or a `PoolClient` so
services can group writes in a transaction. They return
camelCase models with kobo amounts as `bigint`; they do not contain budgeting
calculations or period rules.

Repository modules are split by entity: users, budgets, periods, categories,
jars, allocations, income, expenses, commitments, summaries, rollovers, and
audit history, plus idempotency records. Query failures raise `RepositoryError`;
missing required records raise the existing `AppError` with status 404.

`src/services/budgeting.service.ts` coordinates budget persistence and the pure
calculation functions. Multi-record writes run in transactions; budget, income,
and expense creates use user-scoped idempotency keys, and budget/allocation
updates require expected versions to reject stale writes. Income, expenses, and
allocations cannot be changed in closed periods, and archived budgets reject
financial writes.

## Test locally

```bash
npm test
```

The Jest suite runs the portable migrations against pg-mem with PostgreSQL
features disabled. pg-mem cannot parse exclusion constraints or advisory locks
and mishandles partial unique indexes on composite-FK parent tables after an
`UPDATE`, so those constraints are covered by the `.postgres.sql` add-on instead.

## API endpoints

- `GET /health`
- `POST /wallets`
- `GET /wallets/:userId`
- `GET /wallets/:userId/ledger`
- `POST /wallets/:userId/deposits` (requires `idempotency-key` header)
- `POST /transfers` (requires `idempotency-key` header)
- `GET /transactions?userId=...`
- `GET /transactions/:reference`
- `POST /webhooks/paystack`
- `GET /docs`
- `GET /openapi.json`

## Data model

The initial migration in `database/migrations/001_initial_schema.sql` includes
the legacy wallet module: `wallets`, `transactions`, `ledger_entries`, and
`idempotency_keys`. Those tables are unchanged and remain isolated from budgeting
records.

The budgeting tables listed under **Database schema and migrations** model users, budgets,
periods, jars, allocations, income, expenses, commitments, close-time
summaries, rollovers, and audit history. See
`docs/DATABASE-DOMAIN-MODEL.md` for the entity relationships and constraints.

Indexes cover transaction lookups, ledger history, user/status lookups, recent
period and expense queries, and jar/period summary queries.