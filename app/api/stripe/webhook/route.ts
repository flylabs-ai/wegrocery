import { getStripeCredentials } from "@/lib/payments/stripe-credentials";
import { receiveWebhook, webhookResponse } from "@/lib/payments/webhook-receive";

// Stripe -> app notifications for online payments and their refunds. Public
// (excluded from the auth proxy): authenticity comes from the signature,
// verified on the raw body with STRIPE_WEBHOOK_SECRET (or the in-app
// connection's endpoint secret, lib/payments/stripe-credentials.ts) by the
// FlyLabs Kit (lib/payments/webhook-receive.ts). Amounts always come from the
// signed event or from Stripe's API, never from the success redirect.
// The endpoint subscribes to REQUIRED_STRIPE_EVENTS (lib/payments/config.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // The env's key and secret or, without them, the group's in-app connection.
  const credentials = await getStripeCredentials();
  const secret = credentials.source === "none" ? null : credentials.webhookSecret;
  const signature = req.headers.get("stripe-signature");
  const outcome = await receiveWebhook(await req.text(), signature, { key: credentials.status, secret });
  return webhookResponse(outcome, signature);
}
