import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emailIdempotencyKey, minuteBucket } from "./idempotency";

describe("emailIdempotencyKey", () => {
  it("keeps the WeGrocery algorithm and separates logical parts", () => {
    const now = new Date("2026-11-16T12:34:56Z");
    const expected = createHash("sha256").update(`event\u001f42\u001f${now.toISOString()}`).digest("hex").slice(0, 48);
    expect(emailIdempotencyKey("event", 42, now)).toBe(expected);
    expect(emailIdempotencyKey("ab", "c")).not.toBe(emailIdempotencyKey("a", "bc"));
  });
  it("collapses requests in one minute, allowing a later deliberate resend", () => {
    expect(minuteBucket(new Date(60_000))).toBe(1);
    expect(minuteBucket(new Date(119_999))).toBe(1);
    expect(minuteBucket(new Date(120_000))).toBe(2);
  });
});
