import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/observability";
import { recordUsageBatch } from "@/lib/usage/events";
import { pushState } from "./config";
import type { PushPayload } from "./payload";
import { countOutcomes, pushKeys, pushTopic, resolveTransport, runWithinBudget, sendPush } from "./transport";

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/usage/events", () => ({ recordUsageBatch: vi.fn() }));
vi.mock("@/lib/brand/get-brand", () => ({ getBrand: vi.fn() }));

// Public P-256 generator and scalar 1: a fixed test vector, unusable as credentials.
const generator = Buffer.from(
  "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296" +
  "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", "hex",
).toString("base64url");
const env = {
  PUSH_TRANSPORT: "live",
  VERCEL_ENV: "production",
  VAPID_PUBLIC_KEY: generator,
  VAPID_PRIVATE_KEY: Buffer.from("01".padStart(64, "0"), "hex").toString("base64url"),
  VAPID_SUBJECT: "mailto:ops@example.test",
};
const target = {
  subscriptionId: "test-subscription", personId: "test-person",
  endpoint: "https://fcm.googleapis.com/test/private-endpoint",
  p256dh: generator, auth: Buffer.alloc(16).toString("base64url"),
};
const payload: PushPayload = { title: "Test", body: "Private test body", url: "/", schemaVersion: 1 };
const opts = { env, ttl: 900, topic: pushTopic("test-event") };
const never = () => new Promise<never>(() => {});

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("transport policy", () => {
  it.each([
    [{}, "live"],
    [{ PUSH_TRANSPORT: undefined }, "simulated"],
    [{ PUSH_TRANSPORT: " live " }, "simulated"],
    [{ PUSH_TRANSPORT: "LIVE" }, "simulated"],
    [{ VERCEL_ENV: "Production" }, "simulated"],
    [{ VERCEL_ENV: undefined }, "simulated"],
    [{ DEMO_MODE: "true" }, "simulated"],
    [{ DEMO_MODE: "true", VERCEL_URL: "demo.example.test", PUSH_SEGREGATED_ORIGIN: "https://demo.example.test" }, "live"],
    [{ VERCEL_ENV: "preview" }, "simulated"],
    [{ VERCEL_ENV: "preview", APP_BASE_URL: "https://coop.example.test", PUSH_SEGREGATED_ORIGIN: "https://coop.example.test" }, "simulated"],
    [{ VERCEL_ENV: "preview", VERCEL_URL: "preview.example.test", PUSH_SEGREGATED_ORIGIN: "https://preview.example.test" }, "live"],
    [{ VERCEL_ENV: "preview", VERCEL_URL: "preview.example.test", PUSH_SEGREGATED_ORIGIN: "https://preview.example.test/path" }, "simulated"],
    [{ VERCEL_ENV: undefined, APP_BASE_URL: "https://isolated.example.test", PUSH_SEGREGATED_ORIGIN: "https://isolated.example.test" }, "live"],
    [{ PUSH_PILOT_MEMBER_IDS: "someone, test-person , another" }, "live"],
    [{ PUSH_PILOT_MEMBER_IDS: "test-person-other" }, "simulated"],
    [{ PUSH_PILOT_MEMBER_IDS: "" }, "simulated"],
    [{ VAPID_PUBLIC_KEY: undefined }, "simulated"],
    [{ VAPID_PRIVATE_KEY: undefined }, "simulated"],
    [{ VAPID_PRIVATE_KEY: Buffer.from("02".padStart(64, "0"), "hex").toString("base64url") }, "simulated"],
    [{ VAPID_SUBJECT: "https://user@example.test" }, "simulated"],
  ])("enforces exact activation and person eligibility %#", (overrides, result) => {
    expect(resolveTransport({ ...env, ...overrides }, target.personId)).toBe(result);
  });

  it("exposes the four operational states and rejects an incoherent pair", () => {
    expect(pushState({})).toBe("off");
    expect(pushState({ ...env, PUSH_TRANSPORT: "simulated" })).toBe("simulated");
    expect(pushState(env)).toBe("live");
    expect(pushState({ ...env, PUSH_TRANSPORT: "off" })).toBe("off");
    expect(pushState({ ...env, VAPID_PRIVATE_KEY: "bad" })).toBe("misconfigured");
    expect(pushKeys({ ...env, VAPID_PRIVATE_KEY: "bad" })).toBeNull();
  });

  it("makes a 32-character URL-safe topic from SHA-256", () => {
    expect(pushTopic("test-event")).toMatch(/^[\w-]{32}$/);
    expect(pushTopic("test-event")).toBe(createHash("sha256").update("test-event").digest("base64url").slice(0, 32));
  });
});

describe("delivery", () => {
  it.each([
    [201, "accepted"], [404, "expired"], [410, "expired"], [400, "rejected"], [413, "rejected"],
    [401, "config_error"], [403, "config_error"], [429, "transient"], [500, "transient"], [503, "transient"],
  ])("classifies HTTP %s as %s, with explicit request options", async (statusCode, outcome) => {
    const send = vi.fn(async () => {
      if (statusCode !== 201) throw { statusCode };
      return { statusCode };
    });
    expect(await sendPush(target, payload, { ...opts, send })).toEqual({ outcome, code: statusCode });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      expect.objectContaining({ TTL: 900, topic: opts.topic, urgency: "normal", timeout: 5_000 }),
    );
  });

  it.each([
    "https://localhost/push", "https://127.0.0.1/push", "https://[::1]/push",
    "https://service.internal/push", "https://fcm.googleapis.com:443/push",
    "https://user@fcm.googleapis.com/push", "https://fcm.googleapis.com.fake.test/push",
    "https://fakepush.apple.com/push", "http://fcm.googleapis.com/push",
  ])("blocks unsupported endpoints before sending", async (endpoint) => {
    const send = vi.fn();
    expect(await sendPush({ ...target, endpoint }, payload, { ...opts, send })).toEqual({ outcome: "rejected_host", code: null });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { VERCEL_ENV: "preview", VERCEL_URL: "staging.example.test" },
    { VERCEL_ENV: "preview", VERCEL_URL: "preview.example.test" },
    { VERCEL_ENV: "production", DEMO_MODE: "true" },
  ])("makes zero provider calls without isolated-origin approval: %j", async (overrides) => {
    const send = vi.fn();
    await expect(sendPush(target, payload, { ttl: 60, topic: "test", env: { ...env, ...overrides }, send }))
      .resolves.toEqual({ outcome: "simulated", code: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("never sends in simulation or with an oversized UTF-8 payload", async () => {
    const send = vi.fn();
    expect(await sendPush(target, payload, { ...opts, env: {}, send })).toEqual({ outcome: "simulated", code: null });
    expect(await sendPush(target, { ...payload, body: "🛒".repeat(800) }, { ...opts, send })).toEqual({ outcome: "rejected", code: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("classifies a network failure and aborts a hung sender after five seconds", async () => {
    vi.useFakeTimers();
    const failed = sendPush(target, payload, { ...opts, send: async () => { throw new Error("synthetic network failure"); } });
    const stuck = sendPush(target, payload, { ...opts, send: never });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await failed).toEqual({ outcome: "transient", code: null });
    expect(await stuck).toEqual({ outcome: "transient", code: null });
  });

  it("logs only allowed fields and raises one configuration alarm per run", async () => {
    const send = async () => ({ statusCode: 403 });
    await runWithinBudget([1, 2], () => sendPush(target, payload, { ...opts, send }));
    const fields = { eventType: "web_push", outcome: "config_error", code: 403, host: "fcm.googleapis.com" };
    expect(reportError).toHaveBeenCalledExactlyOnceWith("push", "config_error", fields);
    expect(console.info).toHaveBeenCalledExactlyOnceWith("[push]", fields);
  });

  it("receives a redirect from the installed web-push library without following it", async () => {
    const request = vi.spyOn(https, "request").mockImplementation((_options, callback) => {
      // https.request also has the (options, callback) overload used by web-push.
      const respond = callback as unknown as (response: EventEmitter) => void;
      const response = Object.assign(new EventEmitter(), {
        statusCode: 307, headers: { location: "https://elsewhere.invalid/push" },
      });
      const stream = Object.assign(new EventEmitter(), {
        end() {
          respond(response);
          response.emit("end");
        },
      });
      return stream as never;
    });

    // No payload or VAPID config is needed to verify the HTTP behavior.
    await expect(webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } })).rejects.toMatchObject({ statusCode: 307 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("delivery run", () => {
  it("stops waiting on hung work at the budget, leaving only unstarted items", async () => {
    vi.useFakeTimers();
    const work = vi.fn(async (item: number) => item === 0 ? "finished" : never());
    const run = runWithinBudget([0, 1, 2, 3, 4, 5], work);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await run).toEqual({ done: ["finished"], left: [5] });
    expect(work.mock.calls.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  it("records the outcomes as one aggregated increment", async () => {
    await countOutcomes(["accepted", "expired", "transient", "config_error", "rejected", "rejected_host", { outcome: "simulated", code: null }]);
    expect(recordUsageBatch).toHaveBeenCalledExactlyOnceWith([
      { name: "push_accepted", count: 1 }, { name: "push_expired", count: 1 },
      { name: "push_failed", count: 3 }, { name: "push_skipped", count: 1 }, { name: "push_simulated", count: 1 },
    ]);
  });
});
