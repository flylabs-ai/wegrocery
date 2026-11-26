-- Store device subscriptions, per-person push consent and delivery state.
-- The restricted app role inherits the owner's default table privileges
-- (SELECT, INSERT, UPDATE, DELETE), as in 0055 (scripts/db-role-lib.mjs).
-- The p256dh and auth ranges allow base64url encodings of 65 and 16 bytes,
-- respectively (87 and 22 characters observed on subscriptions).
--
-- Apply:    node scripts/db-migrate.mjs --dir drizzle (before deploying W4).
--           Additive and idempotent. The runner opens a transaction and
--           sets lock_timeout before applying this file.
-- Rollback: drizzle/0057_push_subscriptions_down.sql.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscription_id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 30),
  device_label text CHECK (char_length(device_label) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_person_idx ON push_subscriptions (person_id);

CREATE TABLE IF NOT EXISTS push_consents (
  person_id text NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, category)
);

CREATE TABLE IF NOT EXISTS push_deliveries (
  event_key text NOT NULL,              -- 'order_draft_reminder:<cycle_id>:<member_id>'
  subscription_id text NOT NULL REFERENCES push_subscriptions(subscription_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','accepted','expired','rejected','config_error',
                      'skipped','simulated','failed')),
  attempts smallint NOT NULL DEFAULT 0,
  not_before timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  last_code smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_key, subscription_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_due_idx ON push_deliveries (status, not_before);
