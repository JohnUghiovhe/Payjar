# PAYJAR database migrations

This document describes the DB-03 migration setup.

## Layout

All schema changes live in `database/migrations`:

```text
database/
  migrations/
    001_initial_schema.sql
    001_initial_schema.postgres.sql
```

- `NNN_description.sql` is the portable migration. It must run on PostgreSQL and
  on pg-mem, which the Jest suite uses.
- `NNN_description.postgres.sql` is an optional PostgreSQL-only add-on. The
  runner executes it after the portable file, inside the same transaction, when
  PostgreSQL features are enabled.
- Prefixes are zero-padded (`001`, `002`, …). Files are applied in filename
  order.
- A migration file must not contain `BEGIN`, `COMMIT`, or `CREATE INDEX
  CONCURRENTLY`. The runner owns the transaction.

## Tracking

The runner creates this table when it first runs:

```sql
CREATE TABLE schema_migrations (
  id text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

`id` is the filename without `.sql` (for example `001_initial_schema`).
`checksum` is a SHA-256 hash of the portable file plus its PostgreSQL add-on.
`applied_at` records when the migration committed.

## Running migrations

The application applies pending migrations at startup before serving traffic:

```bash
npm run build
npm start
```

To run only the migration step:

```bash
npm run build
npm run migrate
```

`npm run migrate` requires `DATABASE_URL` and a built `dist/` directory.

To create a clean local database:

```bash
createdb payjar
npm run migrate
```

## Safety behaviour

- **Advisory lock:** PostgreSQL runs use `pg_advisory_lock` so two application
  instances cannot apply migrations at the same time. The lock is released in a
  `finally` block.
- **One transaction per migration:** each migration and its tracking insert
  commit together. If SQL fails, that migration is rolled back and is not
  recorded.
- **Ordered progress:** earlier successful migrations stay applied. Later
  migrations are not attempted after a failure.
- **Checksum verification:** before applying anything, the runner compares each
  recorded checksum with the file on disk. Editing an applied migration is
  rejected. Add a new migration instead.
- **Missing files:** if the database records a migration that is no longer in
  `database/migrations`, the runner fails instead of silently continuing.
- **No automatic rollback of earlier migrations:** migrations are forward-only.
  Use a new migration to correct a released schema change, or restore a backup.

## Existing databases

The baseline migration is safe to adopt on an existing database created from the
old `database/schema.sql` process:

- Tables use `CREATE TABLE IF NOT EXISTS`.
- Indexes use `CREATE INDEX IF NOT EXISTS`; the overlap constraint is guarded by
  a `pg_constraint` check.
- Existing wallet data is not modified or deleted.
- After the first successful run, the baseline is recorded in
  `schema_migrations`.

Back up production data before a migration that changes large tables, rewrites
data, or adds constraints that must scan existing rows.

## Test environment

The Jest suite runs migrations against pg-mem with `postgresFeatures: false`.
That executes the portable files and skips the `.postgres.sql` add-ons, because
pg-mem cannot parse exclusion constraints, install `btree_gist`, use advisory
locks, or safely update a composite-FK parent row after it leaves a partial
unique index.

The portable migrations are still the source of truth for table structure,
ownership foreign keys, and `CHECK` constraints in tests. PostgreSQL-only
constraints are exercised only on a real PostgreSQL database.

## Creating a migration

1. Create the next numbered file, for example
   `database/migrations/002_add_budget_archive_reason.sql`.
2. Write portable SQL only.
3. If the change needs PostgreSQL-only syntax, put it in
   `002_add_budget_archive_reason.postgres.sql`.
4. Make the portable SQL safe for pg-mem. Avoid `gen_random_uuid()`, `EXCLUDE`,
   `btree_gist`, regular-expression checks, and unsupported string functions.
5. Add or update tests.
6. Run `npm test`.
7. Run against a disposable PostgreSQL database before production.

## Troubleshooting

### A migration failed

The runner reports the migration id and the database error. The failed migration
was rolled back and was not recorded. Earlier migrations remain applied.

1. Read the full error.
2. Fix the migration file or resolve the data conflict.
3. Run `npm run migrate` again.

Do not delete the `schema_migrations` row to force a retry if the migration may
have partially changed data outside a transaction. Verify the database state
first.

### Checksum changed

The error means an applied migration file was edited. Restore the original file
and add a new migration for the change. If the edit was intentional and the
database is disposable, recreate the database and run all migrations again.

### Applied migration is missing

The database has a tracking row for a file that no longer exists. Restore the
file. If the file was deleted intentionally, reconcile the database state and
tracking table before continuing.

### Extension permission denied

`001_initial_schema.postgres.sql` runs `CREATE EXTENSION IF NOT EXISTS
btree_gist`. The application role must be allowed to install extensions, or an
administrator must install `btree_gist` first.
