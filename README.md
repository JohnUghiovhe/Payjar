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

The server will automatically apply SQL schema definitions from `database/schema.sql` at startup.

## Test locally

```bash
npm test
```

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

The SQL schema in `database/schema.sql` includes:

- `wallets`
- `transactions`
- `ledger_entries`
- `idempotency_keys`

It also includes indexes for transaction lookups and ledger history queries.