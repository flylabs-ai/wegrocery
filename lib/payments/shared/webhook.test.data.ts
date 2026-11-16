import type { WebhookOutcome } from "./receive";

// App adapters, also shown verbatim in README. They are not module runtime code.
export function stellarWebhookResponse(outcome: WebhookOutcome): Response {
  switch (outcome.kind) {
    case "not_configured": return Response.json({ error: "stripe_not_configured" }, { status: 503 });
    case "invalid_signature": return Response.json({ error: "invalid_signature" }, { status: 400 });
    case "mode_mismatch": return Response.json({ error: "livemode_mismatch" }, { status: 400 });
    case "duplicate": return Response.json({ received: true, duplicate: true });
    case "in_progress": return Response.json({ error: "in_progress" }, { status: 409 });
    case "permanent_error": return Response.json({ received: true, error: "unknown_tenant" });
    case "failed": return Response.json({ error: "failed" }, { status: 500 });
    case "processed": return Response.json({ received: true });
  }
}

export function wegroceryWebhookResponse(outcome: WebhookOutcome, signatureHeader: string | null): Response {
  switch (outcome.kind) {
    case "not_configured": return new Response("Stripe is not configured", { status: 404 });
    case "invalid_signature": return new Response(signatureHeader ? "Invalid signature" : "Missing signature", { status: 400 });
    case "mode_mismatch": return new Response("Mode mismatch", { status: 400 });
    case "failed": return new Response("Handler error", { status: 500 });
    case "in_progress": return new Response("In progress", { status: 409 });
    case "duplicate":
    case "permanent_error":
    case "processed": return Response.json({ received: true });
  }
}
