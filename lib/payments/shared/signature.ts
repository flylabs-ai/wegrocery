import { createHmac, timingSafeEqual } from "node:crypto";

export type StripeEvent = {
  id: string; type: string; livemode: boolean; created: number;
  data: { object: unknown };
};
export type SignatureOptions = { nowSeconds: number; toleranceSeconds?: number };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Verify the unchanged raw body before parsing. No rejection details escape. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, { nowSeconds, toleranceSeconds = 300 }: SignatureOptions): StripeEvent | null {
  try {
    if (!header || !secret.trim() || !Number.isFinite(nowSeconds) || !Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) return null;
    let timestamp: string | undefined;
    const signatures: string[] = [];
    for (const part of header.split(",")) {
      const index = part.indexOf("=");
      const name = part.slice(0, index).trim(); const value = part.slice(index + 1).trim();
      if (name === "t") {
        if (timestamp !== undefined || !/^\d+$/.test(value)) return null;
        timestamp = value;
      }
      if (name === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
    }
    if (!timestamp || !Number.isSafeInteger(Number(timestamp)) || Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return null;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
    if (!signatures.some((signature) => timingSafeEqual(Buffer.from(signature, "hex"), expected))) return null;
    const event: unknown = JSON.parse(payload);
    if (!record(event) || typeof event.id !== "string" || !event.id || typeof event.type !== "string" || !event.type || typeof event.livemode !== "boolean" || typeof event.created !== "number" || !Number.isSafeInteger(event.created) || event.created < 0 || !record(event.data) || !Object.hasOwn(event.data, "object")) return null;
    return event as StripeEvent;
  } catch { return null; }
}
