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

The server automatically applies the portable schema definitions from
`database/schema.sql` at startup.

## Database schema

`database/schema.sql` is the portable baseline. It creates the wallet tables and
the budgeting tables (`users`, `budgets`, `budget_periods`, `categories`, `jars`,
`jar_allocations`, `income_sources`, `income_entries`, `expenses`, `commitments`,
`period_jar_summaries`, `rollover_records`, and `audit_events`).

Kobo amounts are stored as `BIGINT`. Ownership is enforced with composite foreign
keys so a period, jar, allocation, expense, summary, or rollover row cannot
reference another user's or another budget's record. Invalid amounts, statuses,
dates, and close snapshots are rejected by `CHECK` constraints.

On PostgreSQL, apply the PostgreSQL-only hardening after the baseline:

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/schema.postgres.sql
```

`database/schema.postgres.sql` adds the `btree_gist` extension, the
`budget_periods_no_overlap` exclusion constraint, and the partial unique indexes
for one active budget per user, one active period per budget, unique budget/jar
and income-source names, and one jar per category per budget. Startup continues
to apply only `database/schema.sql`; run the PostgreSQL file whenever the
baseline is applied to a new database. The `CREATE EXTENSION` statement requires
a role that can install extensions, or an administrator can install
`btree_gist` first.

To create a clean local database from scratch:

```bash
createdb payjar
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/schema.postgres.sql
```

## Test locally

```bash
npm test
```

The Jest suite runs against pg-mem, which loads only `database/schema.sql`.
pg-mem cannot parse PostgreSQL exclusion constraints and mishandles partial
unique indexes on composite-FK parent tables after an `UPDATE`, so those
constraints are covered by `database/schema.postgres.sql` instead.

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

The SQL schema in `database/schema.sql` includes the legacy wallet module:
`wallets`, `transactions`, `ledger_entries`, and `idempotency_keys`. Those tables
are unchanged and remain isolated from budgeting records.

The budgeting tables listed under **Database schema** model users, budgets,
periods, jars, allocations, income, expenses, commitments, close-time
summaries, rollovers, and audit history. See
`docs/DATABASE-DOMAIN-MODEL.md` for the entity relationships and constraints.

Indexes cover transaction lookups, ledger history, user/status lookups, recent
period and expense queries, and jar/period summary queries.