import type Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { reportError } from "@/lib/observability";
import { createEventStore, type EventQuery, type EventStore } from "./shared/events";
import { receiveStripeWebhook, type WebhookOutcome, type WebhookReport } from "./shared/receive";
import type { StripeKeyStatus } from "./config";
import { applyWebhookAction, planWebhookAction } from "./webhook";

// The Stripe webhook through the FlyLabs Kit (pagamenti 1.0): signature,
// mode check and the stripe_events register (migration 0056) come from
// lib/payments/shared; what an event means and its writes stay here
// (planWebhookAction, applyWebhookAction, all idempotent).

// The kit's register runs on the app's Neon HTTP client: one autocommit
// statement per call, $1, $2... with parameters kept apart from the text.
export function neonEventQuery(): EventQuery {
  return async (text, params) => {
    const rows = (await getDb().$client.query(text, params)) as Record<string, unknown>[];
    return { rows };
  };
}

export type WebhookConfig = { key: StripeKeyStatus; secret: string | null };

export type WebhookDeps = {
  store?: EventStore;
  nowSeconds?: number;
  handle?: (event: Stripe.Event) => Promise<void>;
};

async function handleEvent(event: Stripe.Event): Promise<void> {
  await applyWebhookAction(planWebhookAction(event));
}

// Only identifiers reach the logs, never the payload.
function report(entry: WebhookReport): void {
  if (entry.code === "handler_failed" || entry.code === "permanent_error") return; // logged with the error below
  reportError("stripe webhook", new Error(entry.code), { eventType: entry.eventType, eventId: entry.eventId });
}

export async function receiveWebhook(
  payload: string,
  signatureHeader: string | null,
  config: WebhookConfig,
  deps: WebhookDeps = {},
): Promise<WebhookOutcome> {
  const handle = deps.handle ?? handleEvent;
  return receiveStripeWebhook(payload, signatureHeader, {
    // A key refused by the live/test policy counts as not configured, as before.
    secret: config.key.enabled ? config.secret : null,
    livemode: config.key.enabled ? config.key.livemode : undefined,
    store: deps.store ?? createEventStore(neonEventQuery()),
    nowSeconds: deps.nowSeconds ?? Math.floor(Date.now() / 1000),
    // The signed payload is a whole Stripe event; the handlers read it with the SDK types.
    handle: async (event) => {
      const stripeEvent = event as unknown as Stripe.Event;
      try {
        await handle(stripeEvent);
      } catch (e) {
        reportError("stripe webhook", e, { eventType: event.type, eventId: event.id });
        throw e;
      }
    },
    // Every failure is retried by Stripe with backoff: the handlers are idempotent.
    isPermanentError: () => false,
    report,
  });
}

// The HTTP answers WeGrocery always gave, unchanged; the register adds 409
// for a delivery still running and 200 for one already processed.
export function webhookResponse(outcome: WebhookOutcome, signatureHeader: string | null): Response {
  switch (outcome.kind) {
    case "not_configured":
      return new Response("Stripe is not configured", { status: 404 });
    case "invalid_signature":
      return new Response(signatureHeader ? "Invalid signature" : "Missing signature", { status: 400 });
    case "mode_mismatch":
      return new Response("Mode mismatch", { status: 400 });
    case "failed":
      return new Response("Handler error", { status: 500 });
    case "in_progress":
      return new Response("In progress", { status: 409 });
    case "duplicate":
    case "permanent_error":
    case "processed":
      return Response.json({ received: true });
  }
}
