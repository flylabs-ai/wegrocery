import { createHmac } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { describeDb, testSql } from "@/test/int/fixtures";
import { createEventStore } from "./shared/events";
import { neonEventQuery, receiveWebhook } from "./webhook-receive";

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

// The kit's register (migration 0056) on the app's Neon client: a delivery
// runs the handlers once, a failed one is retried, a processed one is not.
describeDb("Stripe webhook register (stripe_events)", () => {
  const run = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const secret = "whsec_" + "synthetic_" + "x".repeat(32);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const key = { enabled: true as const, secretKey: "sk_test_example", livemode: false };
  const eventFor = (id: string) => {
    const body = JSON.stringify({ id, type: "charge.refunded", livemode: false, created: nowSeconds, data: { object: {} } });
    const header = `t=${nowSeconds},v1=${createHmac("sha256", secret).update(`${nowSeconds}.${body}`).digest("hex")}`;
    return [body, header] as const;
  };
  const ids: string[] = [];
  const newId = (name: string) => { const id = `evt_int_${run}_${name}`; ids.push(id); return id; };

  afterAll(async () => {
    await testSql`DELETE FROM stripe_events WHERE id = ANY(${ids})`;
  });

  it("runs the handlers once per event", async () => {
    const id = newId("once");
    const [body, header] = eventFor(id);
    const handle = vi.fn(async () => {});
    const store = createEventStore(neonEventQuery());
    expect(await receiveWebhook(body, header, { key, secret }, { store, nowSeconds, handle })).toEqual({ kind: "processed" });
    expect(await receiveWebhook(body, header, { key, secret }, { store, nowSeconds, handle })).toEqual({ kind: "duplicate" });
    expect(handle).toHaveBeenCalledTimes(1);
    const [row] = await testSql`SELECT type, processed_at IS NOT NULL AS done, error FROM stripe_events WHERE id = ${id}`;
    expect(row).toEqual({ type: "charge.refunded", done: true, error: null });
  });

  it("lets Stripe retry a failed delivery right away, storing only a code", async () => {
    const id = newId("retry");
    const [body, header] = eventFor(id);
    const store = createEventStore(neonEventQuery());
    const failing = vi.fn(async () => { throw new Error("member@example.com private failure"); });
    expect(await receiveWebhook(body, header, { key, secret }, { store, nowSeconds, handle: failing })).toEqual({ kind: "failed" });
    const [stored] = await testSql`SELECT processed_at, error FROM stripe_events WHERE id = ${id}`;
    expect(stored).toEqual({ processed_at: null, error: "handler_failed" });
    const handle = vi.fn(async () => {});
    expect(await receiveWebhook(body, header, { key, secret }, { store, nowSeconds, handle })).toEqual({ kind: "processed" });
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
