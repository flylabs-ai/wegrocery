import { createHash } from "node:crypto";

/** Include the app/account and logical operation revision in the supplied scope/parts. */
export function idempotencyKey(scope: string, ...parts: string[]): string {
  const input = [scope, ...parts];
  if (input.some((part) => typeof part !== "string" || !part.trim())) throw new Error("Empty idempotency scope or part");
  // JSON preserves part boundaries and does not expose identifiers in the key.
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
