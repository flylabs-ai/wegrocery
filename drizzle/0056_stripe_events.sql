-- Register of Stripe webhook deliveries (FlyLabs Kit pagamenti 1.0,
-- lib/payments/shared/events.ts): one row per event id, so a delivery already
-- processed answers 200 without running the handlers again, and two
-- concurrent deliveries of the same event do not both run them. Same columns
-- as the kit's STRIPE_EVENTS_SQL. Only fixed diagnostic codes go in `error`,
-- never payment data.
-- The restricted app role inherits the owner's default table privileges,
-- as for 0049_cycle_open_alerts.sql (scripts/db-migrate-lib.mjs).
--
-- Apply:    node scripts/db-migrate.mjs (APPLY BEFORE DEPLOYING the code that
--           ships with it: without the table every webhook answers 500 and
--           Stripe retries). Additive and idempotent; the runner applies this
--           file in a transaction with lock_timeout.
-- Rollback: drizzle/0056_stripe_events_down.sql.

CREATE TABLE IF NOT EXISTS stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text
);
