-- "Migrazioni" (FlyLabs Kit phase C2): the console applies an installation's
-- pending migrations from a commit of staging/main, after a Neon backup
-- branch. One row per run: which instance, which commit, the outcome, the
-- files applied and the backup branch. Names and fixed texts only: never a
-- connection string, SQL or a key. Plus two optional instance fields for the
-- owner's role and database name (Neon defaults when empty).
-- Additive and idempotent: safe to run twice.

ALTER TABLE instances ADD COLUMN IF NOT EXISTS neon_owner_role text;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS neon_database text;

CREATE TABLE IF NOT EXISTS migration_runs (
  id text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES instances (id) ON DELETE CASCADE,
  commit_sha text NOT NULL,
  branch text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  applied jsonb NOT NULL DEFAULT '[]'::jsonb,
  backup_branch text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS migration_runs_instance_idx ON migration_runs (instance_id, started_at DESC);
