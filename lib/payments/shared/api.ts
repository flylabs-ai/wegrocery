import { isLiveStripeKey } from "./mode";

/** App-owned version, no SDK, fetch, env access or default API version. */
export function stripeHeaders({ secretKey, apiVersion, idempotencyKey }: { secretKey: string; apiVersion: string; idempotencyKey?: string }): Record<string, string> {
  isLiveStripeKey(secretKey);
  if (!apiVersion || !/^[\x21-\x7e]+$/.test(apiVersion)) throw new Error("Invalid Stripe API version");
  if (idempotencyKey !== undefined && !/^[\x21-\x7e]{1,255}$/.test(idempotencyKey)) throw new Error("Invalid idempotency key");
  return {
    Authorization: `Bearer ${secretKey.trim()}`, "Stripe-Version": apiVersion,
    "Content-Type": "application/x-www-form-urlencoded",
    ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}
