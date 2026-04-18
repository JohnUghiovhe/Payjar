# PayJar

PayJar is a backend-driven wallet and transaction system built around double-entry accounting, idempotent writes, and secure Paystack webhook verification.

## What is in place

- Wallet creation per user
- Deposit initiation with idempotency keys
- Paystack webhook verification using `x-paystack-signature`
- Peer-to-peer transfers
- Transaction history lookup
- PostgreSQL schema with indexes for wallet, transaction, and ledger queries

## Run locally

```bash
npm install
npm run build
npm start
```

## API surface

- `POST /wallets`
- `GET /wallets/:userId`
- `POST /wallets/:userId/deposits`
- `POST /transfers`
- `GET /transactions?userId=...`
- `POST /webhooks/paystack`

## Notes

- The current runtime uses an in-memory store so the backend can start immediately.
- The PostgreSQL schema in `database/schema.sql` matches the intended production data model and can be wired to `pg` next.