-- Rollback of 0055_draft_reminders.sql. Stop the reminder cron and deploy code
-- that no longer reads this table before running this file by hand.
-- Reminder reservations are lost; remove its _migrations row before reapplying.
DROP TABLE IF EXISTS draft_reminders;
