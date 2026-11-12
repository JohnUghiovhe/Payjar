-- Migration 001 (PostgreSQL-only add-on): schema hardening.
--
-- The migration runner applies this file after 001_initial_schema.sql inside
-- the same transaction when PostgreSQL features are enabled. It is intentionally
-- separate because pg-mem (used by the test suite) cannot parse EXCLUDE
-- constraints, install btree_gist, or safely update a composite-FK parent row
-- after it leaves a partial unique index.
--
-- Everything here is still part of DB-02. Application-level validation
-- remains required for clear error messages, but the database is the final
-- guard in PostgreSQL.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Partial unique indexes on composite-FK parent tables
-- ---------------------------------------------------------------------------
-- pg-mem keeps these rows in its composite-FK lookup after an UPDATE removes
-- them from the partial index, which breaks later child inserts. PostgreSQL
-- does not have that defect, so the constraints are applied there.

CREATE UNIQUE INDEX IF NOT EXISTS budgets_one_active_per_user
  ON budgets (user_id)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS budget_periods_one_active_per_budget
  ON budget_periods (budget_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS jars_name_unique_per_budget
  ON jars (budget_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jars_category_unique_per_budget
  ON jars (budget_id, category_id)
  WHERE category_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS income_sources_name_unique_per_user
  ON income_sources (user_id, lower(name))
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Period overlap protection
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budget_periods_no_overlap'
      AND conrelid = 'budget_periods'::regclass
  ) THEN
    ALTER TABLE budget_periods
      ADD CONSTRAINT budget_periods_no_overlap
      EXCLUDE USING gist (
        budget_id WITH =,
        daterange(starts_on, ends_on, '[]') WITH &&
      );
  END IF;
END $$;
