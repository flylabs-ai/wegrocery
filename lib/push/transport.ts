import { AsyncLocalStorage } from "node:async_hooks";
import {
  sendPush as sendKitPush, runWithinBudget as runKitWithinBudget,
  type PushOutcome, type PushResult, type Sender,
} from "@/lib/web-push/transport";
import { reportError } from "@/lib/observability";
import { recordUsageBatch, type PushUsageEvent } from "@/lib/usage/events";
import { pushKeys, resolveTransport, transportPolicy } from "./config";
import { serializePushPayload, type PushPayload } from "./payload";
import { pushEndpointHost } from "./subscription";

export { pushKeys, resolveTransport };

export type PushTarget = {
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  personId: string;
};

export { pushTopic } from "@/lib/web-push/transport";
export type { PushOutcome };

const pushRun = new AsyncLocalStorage<{ reportedConfigError: boolean }>();

export async function sendPush(target: PushTarget, payload: PushPayload, opts: {
  ttl: number;
  topic: string;
  env?: Record<string, string | undefined>;
  send?: Sender;
}): Promise<PushResult> {
  const run = pushRun.getStore();
  const host = pushEndpointHost(target.endpoint);
  function record(outcome: PushOutcome, code: number | null = null): PushResult {
    const fields = { eventType: "web_push", outcome, code, host };
    if (outcome === "config_error" && !run?.reportedConfigError) {
      if (run) run.reportedConfigError = true;
      reportError("push", "config_error", fields);
    } else {
      console.info("[push]", fields);
    }
    return { outcome, code };
  }

  if (!host) return record("rejected_host");
  const env = opts.env ?? process.env;
  if (resolveTransport(env, target.personId) === "simulated") return record("simulated");

  let serialized: string;
  try {
    serialized = serializePushPayload(payload);
  } catch {
    return record("rejected");
  }
  // The Kit uses the queue's existing outcomes. The queue retries transient
  // results and finalizes rejected_host as rejected.
  const result = await sendKitPush(target, serialized, {
    ttl: opts.ttl,
    topic: opts.topic,
    policy: transportPolicy(env, target.personId),
    send: opts.send,
  });
  return record(result.outcome, result.code);
}

export function runWithinBudget<T, R>(
  items: T[],
  work: (item: T) => Promise<R>,
  options?: { concurrency?: number; budgetMs?: number },
): Promise<{ done: R[]; left: T[] }> {
  return pushRun.run({ reportedConfigError: false }, () => runKitWithinBudget(items, work, options));
}

const outcomeEvents: Record<PushOutcome, PushUsageEvent> = {
  accepted: "push_accepted",
  expired: "push_expired",
  rejected: "push_failed",
  config_error: "push_failed",
  transient: "push_failed",
  rejected_host: "push_skipped",
  simulated: "push_simulated",
};

export async function countOutcomes(outcomes: readonly (PushOutcome | PushResult)[]): Promise<void> {
  const counts = new Map<PushUsageEvent, number>();
  for (const result of outcomes) {
    const event = outcomeEvents[typeof result === "string" ? result : result.outcome];
    counts.set(event, (counts.get(event) ?? 0) + 1);
  }
  await recordUsageBatch(Array.from(counts, ([name, count]) => ({ name, count })));
}
