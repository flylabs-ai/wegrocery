import { createHmac, timingSafeEqual } from "node:crypto";

// Requests to /api/instance-stats are signed by the FlyLabs Console
// (Playbook 7.10, flylabs-kit registry/console, the scheme of WeGrocery's):
// an HMAC-SHA256, keyed with this deploy's INSTANCE_STATS_SECRET, of
// "<unix seconds>.<METHOD>.<path>", in lowercase hex. The timestamp bounds a
// replay to MAX_SKEW_SECONDS. Pure: the route passes the clock.

export const TIMESTAMP_HEADER = "x-flylabs-timestamp";
export const SIGNATURE_HEADER = "x-flylabs-signature";
export const MAX_SKEW_SECONDS = 300;
// A shorter secret keeps the endpoint closed rather than accept a key that
// can be guessed.
export const MIN_SECRET_LENGTH = 32;
export const STATS_PATH = "/api/instance-stats";
export type StatsContract = "flylabs" | "wegrocery";
export const HEADER_SCHEMES: readonly { contract: StatsContract; timestamp: string; signature: string }[] = [
  { contract: "flylabs", timestamp: TIMESTAMP_HEADER, signature: SIGNATURE_HEADER },
  { contract: "wegrocery", timestamp: "x-wegrocery-timestamp", signature: "x-wegrocery-signature" },
];

export function signingPayload(timestamp: string, method: string, path: string): string {
  return `${timestamp}.${method.toUpperCase()}.${path}`;
}

export function signRequest(secret: string, timestamp: string, method: string, path: string): string {
  return createHmac("sha256", secret).update(signingPayload(timestamp, method, path)).digest("hex");
}

export type VerifyInput = {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  nowSeconds: number;
};

// true only for a configured secret, a fresh timestamp and a matching
// signature. Every failure looks the same to the caller (the route answers
// 404), so a probe learns nothing about which part was wrong.
export function verifyRequest(input: VerifyInput): boolean {
  const secret = input.secret?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  if (!input.timestamp || !/^\d{1,12}$/.test(input.timestamp)) return false;
  if (Math.abs(input.nowSeconds - Number(input.timestamp)) > MAX_SKEW_SECONDS) return false;
  if (!input.signature || !/^[0-9a-f]{64}$/.test(input.signature)) return false;
  const expected = Buffer.from(signRequest(secret, input.timestamp, input.method, input.path), "hex");
  return timingSafeEqual(expected, Buffer.from(input.signature, "hex"));
}

export function verifiedContract(headers: { get(name: string): string | null }, base: Omit<VerifyInput, "timestamp" | "signature">): StatsContract | null {
  for (const scheme of HEADER_SCHEMES) {
    if (verifyRequest({ ...base, timestamp: headers.get(scheme.timestamp), signature: headers.get(scheme.signature) })) return scheme.contract;
  }
  return null;
}

/** Both pairs keep pre-kit installations and current Consoles interoperable. */
export function signedStatsHeaders(secret: string, nowSeconds: number): Record<string, string> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`INSTANCE_STATS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  const timestamp = String(Math.floor(nowSeconds));
  const signature = signRequest(secret, timestamp, "GET", STATS_PATH);
  return Object.fromEntries(HEADER_SCHEMES.flatMap((scheme) => [[scheme.timestamp, timestamp], [scheme.signature, signature]]));
}
