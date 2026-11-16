import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { receiveStripeWebhook, type ReceiveDependencies, type WebhookOutcome } from "./receive";
import { stellarWebhookResponse, wegroceryWebhookResponse } from "./webhook.test.data";

// Captured from each app's receiver/route, not inferred from the new helpers.
type Scenario = readonly [string, WebhookOutcome["kind"], number, string];
const stellar: readonly Scenario[] = [
  ["not configured", "not_configured", 503, '{"error":"stripe_not_configured"}'],
  ["missing signature", "invalid_signature", 400, '{"error":"invalid_signature"}'],
  ["bad signature", "invalid_signature", 400, '{"error":"invalid_signature"}'],
  ["wrong mode", "mode_mismatch", 400, '{"error":"livemode_mismatch"}'],
  ["ok", "processed", 200, '{"received":true}'],
  ["duplicate", "duplicate", 200, '{"received":true,"duplicate":true}'],
  ["running", "in_progress", 409, '{"error":"in_progress"}'],
  ["permanent", "permanent_error", 200, '{"received":true,"error":"unknown_tenant"}'],
  ["error", "failed", 500, '{"error":"failed"}'],
] as const;
const wegrocery: readonly Scenario[] = [
  ["not configured", "not_configured", 404, "Stripe is not configured"],
  ["missing signature", "invalid_signature", 400, "Missing signature"],
  ["bad signature", "invalid_signature", 400, "Invalid signature"],
  ["wrong mode", "mode_mismatch", 400, "Mode mismatch"],
  ["ok", "processed", 200, '{"received":true}'],
  ["error", "failed", 500, "Handler error"],
] as const;
const secret = "whsec_" + "synthetic_" + "x".repeat(32);
const nowSeconds = 1700000000;
const payload = JSON.stringify({ id: "evt_example", type: "example.updated", livemode: false, created: nowSeconds, data: { object: {} } });
const signature = `t=${nowSeconds},v1=${createHmac("sha256", secret).update(`${nowSeconds}.${payload}`).digest("hex")}`;

for (const [app, cases, translate] of [["Stellar", stellar, stellarWebhookResponse], ["WeGrocery", wegrocery, wegroceryWebhookResponse]] as const) {
  describe(`${app} HTTP parity`, () => {
    it.each(cases)("preserves %s status and body bytes", async (scenario, kind, status, body) => {
      const header = scenario === "missing signature" ? null : scenario === "bad signature" ? "bad" : signature;
      const config: ReceiveDependencies = {
        secret: scenario === "not configured" ? null : secret,
        livemode: scenario === "wrong mode", nowSeconds,
        handle: vi.fn(async () => { if (["permanent", "error"].includes(scenario)) throw new Error("synthetic failure"); }),
        isPermanentError: () => scenario === "permanent", report: () => {},
        ...(app === "Stellar" ? { store: {
          claim: async () => scenario === "duplicate" ? "duplicate" as const : scenario === "running" ? "in_progress" as const : "claimed" as const,
          markDone: async () => {}, markDoneWithError: async () => {}, release: async () => {},
        } } : {}),
      };
      const result = await receiveStripeWebhook(payload, header, config);
      expect(result).toEqual({ kind } satisfies WebhookOutcome);
      const response = translate(result, header);
      expect(response.status).toBe(status); expect(await response.text()).toBe(body);
      if (scenario === "ok") expect(config.handle).toHaveBeenCalledTimes(1);
    });
  });
}
