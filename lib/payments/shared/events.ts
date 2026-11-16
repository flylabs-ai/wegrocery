export type EventQuery = (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type ClaimResult = "claimed" | "duplicate" | "in_progress";
export type EventStore = {
  claim(id: string, type: string): Promise<ClaimResult>;
  markDone(id: string): Promise<void>;
  markDoneWithError(id: string, message: string): Promise<void>;
  release(id: string, message: string): Promise<void>;
};
export const STALE_EVENT_MINUTES = 10;
export const ERROR_MESSAGE_MAX_LENGTH = 200;

// Same columns, defaults and primary key as migrations/016_stripe.sql.
// Copy into an app migration; this module never creates schema itself.
export const STRIPE_EVENTS_SQL = `CREATE TABLE stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text
);`;

/** Only diagnostic codes survive. Truncation alone cannot remove payment data. */
function safeMessage(message: string): string {
  const code = ["handler_failed", "permanent_error", "store_failed"].includes(message) ? message : "webhook_error";
  return code.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

/** Queries run on the app's connection with the database clock and autocommit. */
export function createEventStore(query: EventQuery, { staleMinutes = STALE_EVENT_MINUTES }: { staleMinutes?: number } = {}): EventStore {
  if (!Number.isSafeInteger(staleMinutes) || staleMinutes < 1 || staleMinutes >= 2_147_483_647) throw new Error("Invalid stale event window");
  return {
    async claim(id, type) {
      const claimed = await query(`INSERT INTO stripe_events (id, type) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET received_at = now(), error = NULL
        WHERE stripe_events.processed_at IS NULL
          AND stripe_events.received_at < now() - make_interval(mins => $3)
        RETURNING id`, [id, type, staleMinutes]);
      if (claimed.rows.length) return "claimed";
      const seen = await query("SELECT processed_at IS NOT NULL AS done FROM stripe_events WHERE id = $1", [id]);
      return seen.rows[0]?.done === true ? "duplicate" : "in_progress";
    },
    async markDone(id) {
      await query("UPDATE stripe_events SET processed_at = now(), error = NULL WHERE id = $1", [id]);
    },
    async markDoneWithError(id, message) {
      await query("UPDATE stripe_events SET processed_at = now(), error = $2 WHERE id = $1", [id, safeMessage(message)]);
    },
    async release(id, message) {
      await query("UPDATE stripe_events SET error = $2, received_at = now() - make_interval(mins => $3) WHERE id = $1", [id, safeMessage(message), staleMinutes + 1]);
    },
  };
}
