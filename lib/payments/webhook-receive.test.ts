import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { EventStore } from "./shared/events";
import { receiveWebhook, webhookResponse } from "./webhook-receive";

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

const secret = "whsec_" + "synthetic_" + "x".repeat(32);
const nowSeconds = 1_700_000_000;
const payload = (livemode = false) =>
  JSON.stringify({ id: "evt_example", type: "charge.refunded", livemode, created: nowSeconds, data: { object: {} } });
const sign = (body: string) =>
  `t=${nowSeconds},v1=${createHmac("sha256", secret).update(`${nowSeconds}.${body}`).digest("hex")}`;
const testKey = { enabled: true as const, secretKey: "sk_test_example", livemode: false };

function memoryStore(initial: "claimed" | "duplicate" | "in_progress" = "claimed") {
  const calls: string[] = [];
  const store: EventStore = {
    claim: async () => { calls.push("claim"); return initial; },
    markDone: async () => { calls.push("done"); },
    markDoneWithError: async () => { calls.push("doneWithError"); },
    release: async () => { calls.push("release"); },
  };
  return { store, calls };
}

async function answer(response: Response) {
  return [response.status, await response.text()] as const;
}

describe("Stripe webhook through the kit", () => {
  it("keeps the answers WeGrocery always gave", async () => {
    const { store } = memoryStore();
    const handle = vi.fn(async () => {});
    const run = async (body: string, header: string | null, key: Parameters<typeof receiveWebhook>[2]["key"] = testKey) =>
      answer(webhookResponse(await receiveWebhook(body, header, { key, secret }, { store, nowSeconds, handle }), header));

    expect(await run(payload(), sign(payload()), { enabled: false, reason: "missing" })).toEqual([404, "Stripe is not configured"]);
    expect(await run(payload(), sign(payload()), { enabled: false, reason: "liveKeyOutsideProduction" })).toEqual([404, "Stripe is not configured"]);
    expect(await run(payload(), null)).toEqual([400, "Missing signature"]);
    expect(await run(payload(), "t=1,v1=bad")).toEqual([400, "Invalid signature"]);
    expect(await run(payload(true), sign(payload(true)))).toEqual([400, "Mode mismatch"]);
    expect(handle).not.toHaveBeenCalled();
    expect(await run(payload(), sign(payload()))).toEqual([200, '{"received":true}']);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("answers 500 and releases the event when a handler fails, so Stripe retries", async () => {
    const { store, calls } = memoryStore();
    const handle = vi.fn(async () => { throw new Error("db down"); });
    const outcome = await receiveWebhook(payload(), sign(payload()), { key: testKey, secret }, { store, nowSeconds, handle });
    expect(await answer(webhookResponse(outcome, "x"))).toEqual([500, "Handler error"]);
    expect(calls).toEqual(["claim", "release"]);
  });

  it("does not run the handlers for a delivery already processed or still running", async () => {
    for (const [claim, expected] of [["duplicate", [200, '{"received":true}']], ["in_progress", [409, "In progress"]]] as const) {
      const { store } = memoryStore(claim);
      const handle = vi.fn(async () => {});
      const outcome = await receiveWebhook(payload(), sign(payload()), { key: testKey, secret }, { store, nowSeconds, handle });
      expect(await answer(webhookResponse(outcome, "x"))).toEqual(expected);
      expect(handle).not.toHaveBeenCalled();
    }
  });
});
