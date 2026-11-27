import type { getDb } from "@/lib/db/client";
import { reportError } from "@/lib/observability";
import { recordUsageBatch, type PushUsageEvent } from "@/lib/usage/events";
import { draftReminderPayload } from "./payload";
import { cleanPushQueue, processPushQueue, type QueueDeps, type QueueOutcome, type QueueResult } from "./queue";
import { pushTopic, sendPush } from "./transport";

type Db = ReturnType<typeof getDb>;

const EVENTS: Record<QueueOutcome | "skipped", PushUsageEvent> = {
  accepted: "push_accepted",
  expired: "push_expired",
  rejected: "push_failed",
  config_error: "push_failed",
  transient: "push_failed",
  rejected_host: "push_skipped",
  skipped: "push_skipped",
  simulated: "push_simulated",
};

// The real dependencies of the queue: the transport of lib/push/transport.ts
// (which decides live or simulated per person), the payload of the reminder
// and the anonymous daily counters (OPS-02), aggregated once per run.
export function queueDeps(): QueueDeps {
  return {
    send: (target, payload, opts) => sendPush(target, payload, opts),
    topic: pushTopic,
    payload: draftReminderPayload,
    count: async (outcomes) => {
      const counts = new Map<PushUsageEvent, number>();
      for (const outcome of outcomes) counts.set(EVENTS[outcome], (counts.get(EVENTS[outcome]) ?? 0) + 1);
      await recordUsageBatch(Array.from(counts, ([name, count]) => ({ name, count })));
    },
  };
}

/**
 * One pass over the queue for a cron route. Never throws (WGR-08): a broken
 * transport or database error is reported and the caller's own work stands.
 */
export async function runPushQueue(db: Db, now: Date, { clean = false } = {}): Promise<QueueResult | null> {
  try {
    const result = await processPushQueue(db, now, queueDeps());
    if (clean) await cleanPushQueue(db, now);
    return result;
  } catch (error) {
    reportError("push_queue", error);
    return null;
  }
}
