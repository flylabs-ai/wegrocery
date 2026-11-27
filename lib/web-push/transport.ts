import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Agent } from "node:https";
import webpush from "web-push";
import { resolveTransport, type TransportPolicy } from "./config";
import { pushEndpointHost, type SubscriptionInput } from "./subscription";

export type PushOutcome = "accepted" | "expired" | "rejected" | "config_error" | "transient" | "rejected_host" | "simulated";
export type PushResult = { outcome: PushOutcome; code: number | null };
export type Sender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<{ statusCode: number }>;

const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_BUDGET_MS = 20_000;
const DEFAULT_CONCURRENCY = 4;
const pushRun = new AsyncLocalStorage<{ deadline: number }>();

export function pushTopic(key: string): string {
  return createHash("sha256").update(key).digest("base64url").slice(0, 32);
}

function statusOf(response: unknown): number | null {
  const code = (response as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" && Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
}

export function classify(code: number | null): PushOutcome {
  if (code === 201) return "accepted";
  if (code === 404 || code === 410) return "expired";
  if (code === 401 || code === 403) return "config_error";
  if (code === null || code === 429 || code >= 500) return "transient";
  return "rejected";
}

export function simulatePush(): PushResult {
  return { outcome: "simulated", code: null };
}

export async function sendPush(target: SubscriptionInput, serialized: string, opts: {
  ttl: number;
  topic: string;
  urgency?: webpush.RequestOptions["urgency"];
  policy?: TransportPolicy;
  send?: Sender;
}): Promise<PushResult> {
  const run = pushRun.getStore();
  if (!pushEndpointHost(target.endpoint)) return { outcome: "rejected_host", code: null };
  const transport = resolveTransport(opts.policy);
  if (transport.mode === "simulated") return simulatePush();
  if (Buffer.byteLength(serialized) > 3 * 1024) return { outcome: "rejected", code: null };

  const remaining = run ? Math.floor(run.deadline - performance.now()) : REQUEST_TIMEOUT_MS;
  if (remaining <= 0) return { outcome: "transient", code: null };
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
      { TTL: opts.ttl, topic: opts.topic, urgency: opts.urgency ?? "normal", timeout, agent, vapidDetails: transport.credentials },
    )).then(statusOf, statusOf);
    const code = await Promise.race([request, deadline]);
    return { outcome: classify(code), code };
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
    await pushRun.run({ deadline }, () => Promise.race([
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
