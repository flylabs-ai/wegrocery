import { eventModeMatches } from "./mode";
import { verifyStripeSignature, type StripeEvent } from "./signature";
import type { EventStore } from "./events";

export type WebhookOutcome = { kind: "not_configured" | "invalid_signature" | "mode_mismatch" | "duplicate" | "in_progress" | "processed" | "permanent_error" | "failed" };
export type WebhookReport = {
  code: "mode_mismatch" | "store_failed" | "handler_failed" | "permanent_error";
  eventId?: string;
  eventType?: string;
};
export type ReceiveDependencies = {
  secret: string | null | undefined;
  livemode: boolean | undefined;
  store?: EventStore;
  handle(event: StripeEvent): Promise<void>;
  isPermanentError(error: unknown): boolean;
  nowSeconds: number;
  report(entry: WebhookReport): void | Promise<void>;
};

async function report(deps: ReceiveDependencies, code: WebhookReport["code"], event: StripeEvent): Promise<void> {
  try { await deps.report({ code, eventId: event.id, eventType: event.type }); } catch { /* Reporting must not change webhook acknowledgements. */ }
}

/** The app maps outcomes to its HTTP contract. Reports include identifiers, never contents. */
export async function receiveStripeWebhook(payload: string, signatureHeader: string | null, deps: ReceiveDependencies): Promise<WebhookOutcome> {
  if (!deps.secret?.trim() || typeof deps.livemode !== "boolean") return { kind: "not_configured" };
  const event = verifyStripeSignature(payload, signatureHeader, deps.secret, { nowSeconds: deps.nowSeconds });
  if (!event) return { kind: "invalid_signature" };
  if (!eventModeMatches(event, deps.livemode)) {
    await report(deps, "mode_mismatch", event);
    return { kind: "mode_mismatch" };
  }
  try {
    if (deps.store) {
      const claim = await deps.store.claim(event.id, event.type);
      if (claim !== "claimed") return { kind: claim };
    }
  } catch {
    await report(deps, "store_failed", event);
    return { kind: "failed" };
  }
  try {
    await deps.handle(event);
    await deps.store?.markDone(event.id);
    return { kind: "processed" };
  } catch (error) {
    let permanent = false;
    try { permanent = deps.isPermanentError(error); } catch { /* Retry an unknown failure. */ }
    const code = permanent ? "permanent_error" : "handler_failed";
    await report(deps, code, event);
    try {
      if (permanent) await deps.store?.markDoneWithError(event.id, code);
      else await deps.store?.release(event.id, code);
    } catch {
      await report(deps, "store_failed", event);
      return { kind: "failed" };
    }
    return { kind: permanent ? "permanent_error" : "failed" };
  }
}
