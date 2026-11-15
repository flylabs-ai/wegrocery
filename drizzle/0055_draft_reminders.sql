-- One reminder reservation per cycle and member, independent of the chosen
-- notification channels. Member merges move reservations with the drafts.
-- The restricted app role inherits the owner's default table privileges,
-- as for 0049_cycle_open_alerts.sql (scripts/db-migrate-lib.mjs).
--
-- Apply:    node scripts/db-migrate.mjs (APPLY BEFORE DEPLOYING the code that
--           ships with it). Additive and idempotent; the runner applies this
--           file in a transaction with lock_timeout.
-- Rollback: drizzle/0055_draft_reminders_down.sql.

CREATE TABLE IF NOT EXISTS draft_reminders (
  cycle_id text NOT NULL REFERENCES order_cycles(cycle_id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, member_id)
);
