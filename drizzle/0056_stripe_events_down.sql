-- Rollback of 0056_stripe_events.sql. Deploy code that no longer reads this
-- table before running this file by hand: the webhook would answer 500.
-- The register is lost (Stripe redeliveries then run the idempotent handlers
-- again); remove its _migrations row before reapplying.
DROP TABLE IF EXISTS stripe_events;
