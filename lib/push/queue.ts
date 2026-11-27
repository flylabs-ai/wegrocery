import { sql, type SQL } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";

// The push queue of the draft reminder (PWA spec v1.2, WGR-03..WGR-05,
// WGR-08). Jobs live in push_deliveries, one per (event, device). They are
// booked by the reservation statement of the reminder cron (WGR-04),
// processed right after it and recovered hourly by /api/cron/push-deliveries.
// The queue never writes orders, drafts, ledger, Stripe or draft_reminders.
//
// Guarantee: at most one reminder per device in the normal case. After an
// uncertain outcome (timeout after a possible acceptance) a second send is
// possible; it carries the same Topic and tag, so the push service or the
// device shows it in place of the first. Delivery is best effort.

type Db = ReturnType<typeof getDb>;

export const DRAFT_REMINDER_EVENT = "order_draft_reminder";
export const DRAFT_REMINDER_CATEGORY = "draft_reminder";
/** Jobs stop this long before the order deadline (and the recheck needs it). */
export const PUSH_DEADLINE_MARGIN_MINUTES = 60;
const LEASE_MINUTES = 10;
const MAX_ATTEMPTS = 4;
const CLAIM_LIMIT = 200;
const RETRY_DELAY_MINUTES = 5;
const IN_RUN_WAITS_MS = [2_000, 6_000];
const KEEP_DAYS = 30;
const MAX_TTL_SECONDS = 86_400;

export function draftReminderEventKey(cycleId: string, memberId: string): string {
  return `${DRAFT_REMINDER_EVENT}:${cycleId}:${memberId}`;
}

/**
 * The INSERT of the push jobs, as the second CTE of the reservation statement.
 * `reserved` is the CTE with the (cycle_id, member_id) rows just reserved.
 */
export function bookDraftReminderPushes(reserved: SQL, now: Date): SQL {
  return sql`
    INSERT INTO push_deliveries (event_key, subscription_id, status, not_before, expires_at, created_at, updated_at)
    SELECT ${DRAFT_REMINDER_EVENT} || ':' || r.cycle_id || ':' || r.member_id, s.subscription_id, 'pending',
      ${now}, c.order_close_at - make_interval(mins => ${PUSH_DEADLINE_MARGIN_MINUTES}), ${now}, ${now}
    FROM ${reserved} r
    JOIN order_cycles c ON c.cycle_id = r.cycle_id
    JOIN members m ON m.member_id = r.member_id
    JOIN push_subscriptions s ON s.person_id = r.member_id
    JOIN push_consents pc ON pc.person_id = r.member_id AND pc.category = ${DRAFT_REMINDER_CATEGORY} AND pc.enabled
    WHERE m.household_of IS NULL
      AND c.order_close_at - make_interval(mins => ${PUSH_DEADLINE_MARGIN_MINUTES}) > ${now}
    ON CONFLICT (event_key, subscription_id) DO NOTHING`;
}

export type QueueOutcome = "accepted" | "expired" | "rejected" | "config_error" | "transient" | "rejected_host" | "simulated";

export type QueueTarget = { subscriptionId: string; endpoint: string; p256dh: string; auth: string; personId: string };

export type QueuePayload = { title: string; body: string; url: string; tag?: string; schemaVersion: 1; eventId?: string };

export type QueueDeps = {
  /** lib/push/transport.ts sendPush: resolves the transport, never throws for provider errors. */
  send: (target: QueueTarget, payload: QueuePayload, opts: { ttl: number; topic: string }) =>
    Promise<{ outcome: QueueOutcome; code: number | null }>;
  topic: (key: string) => string;
  payload: (input: { cycleId: string; closeAt: Date; eventKey: string }) => QueuePayload | Promise<QueuePayload>;
  /** Called once per run with every final outcome (OPS-02 counters). */
  count?: (outcomes: Array<QueueOutcome | "skipped">) => Promise<void>;
  budgetMs?: number;
  concurrency?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
};

export type QueueResult = { claimed: number; accepted: number; simulated: number; skipped: number; retry: number; failed: number; left: number };

type Claimed = { event_key: string; subscription_id: string; attempts: number; expires_at: Date | string };
type Eligible = Claimed & { endpoint: string; p256dh: string; auth: string; person_id: string; cycle_id: string; order_close_at: Date | string };

function parseKey(key: string): { cycleId: string; memberId: string } | null {
  if (!key.startsWith(`${DRAFT_REMINDER_EVENT}:`)) return null;
  const rest = key.slice(DRAFT_REMINDER_EVENT.length + 1);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { cycleId: rest.slice(0, cut), memberId: rest.slice(cut + 1) };
}

const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

/**
 * One pass over the queue (WGR-05): claim, recheck, send within the budget,
 * record. With an empty queue it costs the claim statement only.
 */
export async function processPushQueue(db: Db, now: Date, deps: QueueDeps): Promise<QueueResult> {
  const result: QueueResult = { claimed: 0, accepted: 0, simulated: 0, skipped: 0, retry: 0, failed: 0, left: 0 };
  const clock = deps.clock ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = clock() + (deps.budgetMs ?? 20_000);
  const outcomes: Array<QueueOutcome | "skipped"> = [];

  // 1. Claim: due pending jobs and sending jobs whose lease expired.
  const claimed = (await db.execute<Claimed>(sql`
    UPDATE push_deliveries d
    SET status = 'sending', attempts = d.attempts + 1, claimed_at = ${now}, updated_at = ${now}
    FROM (
      SELECT event_key, subscription_id FROM push_deliveries
      WHERE ((status = 'pending' AND not_before <= ${now})
          OR (status = 'sending' AND claimed_at < ${now}::timestamptz - make_interval(mins => ${LEASE_MINUTES})))
        AND expires_at > ${now} AND attempts < ${MAX_ATTEMPTS}
      ORDER BY not_before
      LIMIT ${CLAIM_LIMIT}
      FOR UPDATE SKIP LOCKED
    ) due
    WHERE d.event_key = due.event_key AND d.subscription_id = due.subscription_id
    RETURNING d.event_key, d.subscription_id, d.attempts, d.expires_at
  `)).rows;
  result.claimed = claimed.length;

  if (claimed.length > 0) {
    // 2. Recheck in SQL: cycle open, deadline more than the margin away,
    // draft still there, person still eligible (WGR-03), consent on.
    const parsed = claimed.flatMap((job) => {
      const key = parseKey(job.event_key);
      return key ? [{ ...job, ...key }] : [];
    });
    const eligible = parsed.length === 0 ? [] : (await db.execute<Eligible>(sql`
      SELECT j.event_key, j.subscription_id, j.attempts, j.expires_at, s.endpoint, s.p256dh, s.auth, s.person_id,
        c.cycle_id, c.order_close_at
      FROM (VALUES ${sql.join(parsed.map((job) => sql`(${job.event_key}, ${job.subscription_id}, ${job.attempts}::int,
          ${asDate(job.expires_at)}::timestamptz, ${job.cycleId}, ${job.memberId})`), sql`, `)})
        AS j(event_key, subscription_id, attempts, expires_at, cycle_id, member_id)
      JOIN push_subscriptions s ON s.subscription_id = j.subscription_id AND s.person_id = j.member_id
      JOIN members m ON m.member_id = j.member_id AND m.active AND m.merged_into IS NULL AND m.household_of IS NULL
      JOIN push_consents pc ON pc.person_id = j.member_id AND pc.category = ${DRAFT_REMINDER_CATEGORY} AND pc.enabled
      JOIN order_cycles c ON c.cycle_id = j.cycle_id AND c.status = 'open'
        AND c.order_close_at > ${now}::timestamptz + make_interval(mins => ${PUSH_DEADLINE_MARGIN_MINUTES})
      WHERE EXISTS (SELECT 1 FROM order_drafts d WHERE d.cycle_id = j.cycle_id AND d.member_id = j.member_id)
    `)).rows;
    const sendable = new Set(eligible.map((job) => `${job.event_key}\u0000${job.subscription_id}`));
    const skipped = claimed.filter((job) => !sendable.has(`${job.event_key}\u0000${job.subscription_id}`));
    if (skipped.length > 0) {
      await finish(db, now, skipped, "skipped", null);
      result.skipped += skipped.length;
      outcomes.push(...skipped.map(() => "skipped" as const));
    }

    // 3–4. Send, at most `concurrency` at a time, within the budget; two
    // more tries in this run for a transient outcome, then back to pending.
    const queue = [...eligible];
    const notStarted: Eligible[] = [];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        if (clock() >= deadline) {
          notStarted.push(job, ...queue.splice(0));
          return;
        }
        const final = await deliver(job);
        outcomes.push(final.outcome);
        await record(job, final);
      }
    };

    const deliver = async (job: Eligible) => {
      const closeAt = asDate(job.order_close_at);
      const payload = await deps.payload({ cycleId: job.cycle_id, closeAt, eventKey: job.event_key });
      const target = { subscriptionId: job.subscription_id, endpoint: job.endpoint, p256dh: job.p256dh, auth: job.auth, personId: job.person_id };
      const topic = deps.topic(job.event_key);
      let last: { outcome: QueueOutcome; code: number | null } = { outcome: "transient", code: null };
      for (let attempt = 0; attempt <= IN_RUN_WAITS_MS.length; attempt++) {
        if (attempt > 0) {
          const wait = IN_RUN_WAITS_MS[attempt - 1];
          if (clock() + wait >= deadline) break;
          await sleep(wait);
        }
        const ttl = Math.min(MAX_TTL_SECONDS, Math.floor((asDate(job.expires_at).getTime() - clock()) / 1000));
        if (ttl <= 0) return { outcome: "rejected" as const, code: null, expiredJob: true };
        try {
          last = await deps.send(target, payload, { ttl, topic });
        } catch {
          last = { outcome: "transient", code: null };
        }
        if (last.outcome !== "transient") break;
      }
      return last;
    };

    const record = async (job: Eligible, final: { outcome: QueueOutcome; code: number | null; expiredJob?: boolean }) => {
      switch (final.outcome) {
        case "accepted":
          result.accepted++;
          await finish(db, now, [job], "accepted", final.code);
          await db.execute(sql`UPDATE push_subscriptions SET last_used_at = ${now} WHERE subscription_id = ${job.subscription_id}`);
          return;
        case "simulated":
          result.simulated++;
          return finish(db, now, [job], "simulated", null);
        case "expired":
          // 404/410: the device is gone. Only this row, only if unchanged; the
          // job goes with it (ON DELETE CASCADE).
          result.failed++;
          await finish(db, now, [job], "expired", final.code);
          await db.execute(sql`DELETE FROM push_subscriptions
            WHERE subscription_id = ${job.subscription_id} AND endpoint = ${job.endpoint}`);
          return;
        case "config_error":
          result.failed++;
          return finish(db, now, [job], "config_error", final.code);
        case "rejected":
        case "rejected_host":
          result.failed++;
          return finish(db, now, [job], final.expiredJob ? "failed" : "rejected", final.code);
        case "transient":
          if (job.attempts >= MAX_ATTEMPTS) {
            result.failed++;
            return finish(db, now, [job], "failed", final.code);
          }
          result.retry++;
          await db.execute(sql`UPDATE push_deliveries
            SET status = 'pending', not_before = ${now}::timestamptz + make_interval(mins => ${RETRY_DELAY_MINUTES}),
              last_code = ${final.code}, updated_at = ${now}
            WHERE event_key = ${job.event_key} AND subscription_id = ${job.subscription_id} AND status = 'sending'`);
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 4) }, worker));

    // Over the budget: back to pending, due now, the claim not counted.
    if (notStarted.length > 0) {
      result.left = notStarted.length;
      await db.execute(sql`UPDATE push_deliveries d
        SET status = 'pending', attempts = greatest(d.attempts - 1, 0), not_before = ${now}, updated_at = ${now}
        FROM (VALUES ${sql.join(notStarted.map((job) => sql`(${job.event_key}, ${job.subscription_id})`), sql`, `)})
          AS j(event_key, subscription_id)
        WHERE d.event_key = j.event_key AND d.subscription_id = j.subscription_id AND d.status = 'sending'`);
    }
  }

  if (deps.count && outcomes.length > 0) await deps.count(outcomes).catch(() => {});
  return result;
}

async function finish(db: Db, now: Date, jobs: Array<Pick<Claimed, "event_key" | "subscription_id">>, status: string, code: number | null) {
  await db.execute(sql`UPDATE push_deliveries d
    SET status = ${status}, last_code = ${code}, updated_at = ${now}
    FROM (VALUES ${sql.join(jobs.map((job) => sql`(${job.event_key}, ${job.subscription_id})`), sql`, `)})
      AS j(event_key, subscription_id)
    WHERE d.event_key = j.event_key AND d.subscription_id = j.subscription_id AND d.status = 'sending'`);
}

/**
 * Housekeeping, run by the reminder cron: jobs older than 30 days, and the
 * devices of people deactivated or merged (DEV-05).
 */
export async function cleanPushQueue(db: Db, now: Date): Promise<void> {
  await db.execute(sql`DELETE FROM push_deliveries WHERE created_at < ${now}::timestamptz - make_interval(days => ${KEEP_DAYS})`);
  await db.execute(sql`DELETE FROM push_subscriptions s USING members m
    WHERE m.member_id = s.person_id AND (NOT m.active OR m.merged_into IS NOT NULL)`);
}
