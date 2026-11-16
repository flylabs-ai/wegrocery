import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { receiveStripeWebhook, type ReceiveDependencies } from "./receive";

const secret = "whsec_" + "example_" + "x".repeat(32);
const nowSeconds = 1700000000;
const event = { id: "evt_example", type: "example.updated", livemode: false, created: nowSeconds, data: { object: { privateMarker: "private event content", email: "member@example.com" } } };
const payload = JSON.stringify(event);
const header = `t=${nowSeconds},v1=${createHmac("sha256", secret).update(`${nowSeconds}.${payload}`).digest("hex")}`;
const deps = (extra: Partial<ReceiveDependencies> = {}): ReceiveDependencies => ({ secret, livemode: false, nowSeconds, handle: vi.fn(async () => {}), isPermanentError: () => false, report: vi.fn(), ...extra });
const store = () => ({ claim: vi.fn(async () => "claimed" as const), markDone: vi.fn(async () => {}), markDoneWithError: vi.fn(async () => {}), release: vi.fn(async () => {}) });

describe("receiveStripeWebhook", () => {
  it("checks configuration, signature and mode before storage or handler access", async () => {
    const db = store(); const handle = vi.fn(async () => {});
    expect(await receiveStripeWebhook(payload, header, deps({ secret: null, store: db, handle }))).toEqual({ kind: "not_configured" });
    expect(await receiveStripeWebhook(payload, header, deps({ livemode: undefined, store: db, handle }))).toEqual({ kind: "not_configured" });
    expect(await receiveStripeWebhook(payload, null, deps({ store: db, handle }))).toEqual({ kind: "invalid_signature" });
    expect(await receiveStripeWebhook(payload, header, deps({ livemode: true, store: db, handle }))).toEqual({ kind: "mode_mismatch" });
    expect(db.claim).not.toHaveBeenCalled(); expect(handle).not.toHaveBeenCalled();
  });
  it("reports only authenticated event identifiers and a code, never the content", async () => {
    const report = vi.fn();
    await receiveStripeWebhook(payload, null, deps({ report }));
    await receiveStripeWebhook(payload, "invalid", deps({ report }));
    expect(report).not.toHaveBeenCalled();
    await receiveStripeWebhook(payload, header, deps({ report, livemode: true }));
    expect(report.mock.calls).toEqual([[{ code: "mode_mismatch", eventId: event.id, eventType: event.type }]]);
  });
  it("runs idempotent app handlers without a store, as the current white-label app does", async () => {
    const config = deps();
    expect(await receiveStripeWebhook(payload, header, config)).toEqual({ kind: "processed" });
    expect(await receiveStripeWebhook(payload, header, config)).toEqual({ kind: "processed" });
    expect(config.handle).toHaveBeenCalledTimes(2);
  });
  it.each(["duplicate", "in_progress"] as const)("skips handling a %s claim", async (kind) => {
    const config = deps({ store: { ...store(), claim: vi.fn(async () => kind) } });
    expect(await receiveStripeWebhook(payload, header, config)).toEqual({ kind });
    expect(config.handle).not.toHaveBeenCalled();
  });
  it("marks successful handling done", async () => {
    const db = store();
    expect(await receiveStripeWebhook(payload, header, deps({ store: db }))).toEqual({ kind: "processed" });
    expect(db.markDone).toHaveBeenCalledWith(event.id);
  });
  it("stores only safe codes and ignores failing reporters", async () => {
    const db = store(); const error = new Error("member@example.com private payment details");
    const report = vi.fn(() => { throw error; });
    const base = deps({ store: db, handle: async () => { throw error; }, report });
    expect(await receiveStripeWebhook(payload, header, base)).toEqual({ kind: "failed" });
    expect(db.release).toHaveBeenCalledWith(event.id, "handler_failed");
    expect(await receiveStripeWebhook(payload, header, { ...base, isPermanentError: () => true })).toEqual({ kind: "permanent_error" });
    expect(db.markDoneWithError).toHaveBeenCalledWith(event.id, "permanent_error");
    expect(JSON.stringify(report.mock.calls)).not.toContain("member@example.com");
    expect(report.mock.calls).toEqual([
      [{ code: "handler_failed", eventId: event.id, eventType: event.type }],
      [{ code: "permanent_error", eventId: event.id, eventType: event.type }],
    ]);
    expect(JSON.stringify(report.mock.calls)).not.toContain("private event content");
  });
  it("maps store failures to failed without exposing query errors or processing an unclaimed event", async () => {
    const fail = async () => { throw new Error("private query"); };
    const config = deps({ store: { ...store(), claim: fail } });
    expect(await receiveStripeWebhook(payload, header, config)).toEqual({ kind: "failed" });
    expect(config.handle).not.toHaveBeenCalled();
    expect(config.report).toHaveBeenCalledWith({ code: "store_failed", eventId: event.id, eventType: event.type });
    expect(await receiveStripeWebhook(payload, header, deps({ store: { ...store(), markDone: fail, release: fail } }))).toEqual({ kind: "failed" });
  });
  it("treats a failing permanent-error classifier as retryable", async () => {
    const db = store();
    expect(await receiveStripeWebhook(payload, header, deps({ store: db, handle: async () => { throw new Error(); }, isPermanentError: () => { throw new Error(); } }))).toEqual({ kind: "failed" });
    expect(db.release).toHaveBeenCalled();
  });
});
