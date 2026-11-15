import { createHash, timingSafeEqual } from "node:crypto";

// The one comparison for shared secrets sent in a header (CRON_SECRET, an
// e2e login secret). A plain === stops at the first different character, so
// its timing tells an attacker how much of a guess was right. Both sides go
// through SHA-256 first: the digests always have the same length, so
// timingSafeEqual never throws and the time spent says nothing about the
// secret's length either. An empty or missing secret matches nothing, an
// empty guess included.
export function timingSafeEqualString(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || typeof given !== "string") return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Shortest shared secret the routes accept: shorter ones keep them closed. */
export const MIN_SECRET_LENGTH = 32;

/** Whether a secret is set and long enough to open the routes that need it. */
export function secretUsable(secret: string | null | undefined, minLength = MIN_SECRET_LENGTH): boolean {
  return (secret?.trim().length ?? 0) >= minLength;
}
