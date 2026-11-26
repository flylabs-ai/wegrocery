-- Rollback of 0057_push_subscriptions.sql. Stop delivery jobs and switch to
-- code that does not use these tables before rolling back.
-- This drops all push data. Remove the corresponding _migrations row before
-- reapplying the migration.
DROP TABLE IF EXISTS push_deliveries;
DROP TABLE IF EXISTS push_consents;
DROP TABLE IF EXISTS push_subscriptions;
