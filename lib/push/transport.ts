import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Agent } from "node:https";
import webpush from "web-push";
import { reportError } from "@/lib/observability";
import { recordUsageBatch, type PushUsageEvent } from "@/lib/usage/events";
import { pushKeys, resolveTransport } from "./config";
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

export type PushOutcome = "accepted" | "expired" | "rejected" | "config_error" | "transient" | "rejected_host" | "simulated";
type PushResult = { outcome: PushOutcome; code: number | null };
type Sender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<{ statusCode: number }>;

const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_BUDGET_MS = 20_000;
const DEFAULT_CONCURRENCY = 4;
const pushRun = new AsyncLocalStorage<{ reportedConfigError: boolean; deadline: number }>();

export function pushTopic(key: string): string {
  return createHash("sha256").update(key).digest("base64url").slice(0, 32);
}

function statusOf(response: unknown): number | null {
  const code = (response as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" && Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
}

function classify(code: number | null): PushOutcome {
  if (code === 201) return "accepted";
  if (code === 404 || code === 410) return "expired";
  if (code === 401 || code === 403) return "config_error";
  if (code === null || code === 429 || code >= 500) return "transient";
  return "rejected";
}

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
  const config = resolveTransport(env, target.personId) === "live" ? pushKeys(env) : null;
  if (!config) return record("simulated");

  let serialized: string;
  try {
    serialized = serializePushPayload(payload);
  } catch {
    return record("rejected");
  }
  const remaining = run ? Math.floor(run.deadline - performance.now()) : REQUEST_TIMEOUT_MS;
  if (remaining <= 0) return record("transient");
  const timeout = Math.min(REQUEST_TIMEOUT_MS, remaining);
  const agent = new Agent();
  const send = opts.send ?? webpush.sendNotification;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeout);
    });
    const request = Promise.resolve().then(() => send(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      serialized,
      { TTL: opts.ttl, topic: opts.topic, urgency: "normal", timeout, agent, vapidDetails: config },
    )).then(statusOf, statusOf);
    const code = await Promise.race([request, deadline]);
    return record(classify(code), code);
  } finally {
    clearTimeout(timer);
    agent.destroy();
  }
}

export async function runWithinBudget<T, R>(
  items: T[],
  work: (item: T) => Promise<R>,
  { concurrency = DEFAULT_CONCURRENCY, budgetMs = DEFAULT_BUDGET_MS }: { concurrency?: number; budgetMs?: number } = {},
): Promise<{ done: R[]; left: T[] }> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isFinite(budgetMs) || budgetMs < 0) {
    throw new RangeError("Invalid push run budget");
  }
  const deadline = performance.now() + budgetMs;
  let next = 0;
  let closed = false;
  const completed = new Map<number, R>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function worker() {
    while (!closed && next < items.length && performance.now() < deadline) {
      const index = next++;
      const result = await work(items[index]);
      if (!closed) completed.set(index, result);
    }
  }

  try {
    await pushRun.run({ deadline, reportedConfigError: false }, () => Promise.race([
      new Promise<void>((resolve) => { timer = setTimeout(resolve, budgetMs); }),
      Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)),
    ]));
  } finally {
    closed = true;
    clearTimeout(timer);
  }
  // In-flight work is neither complete nor unstarted. Its caller still owns
  // the claim and its recovery policy.
  const done = Array.from(completed.keys()).sort((a, b) => a - b).map((index) => completed.get(index)!);
  return { done, left: items.slice(next) };
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
