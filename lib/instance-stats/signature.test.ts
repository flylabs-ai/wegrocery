import { describe, expect, it } from "vitest";
import { MAX_SKEW_SECONDS, signRequest, verifyRequest, signedStatsHeaders, verifiedContract } from "./signature";

const secret = "a".repeat(64);
const path = "/api/instance-stats";
const now = 1_800_000_000;

function input(overrides: Partial<Parameters<typeof verifyRequest>[0]> = {}) {
  const timestamp = String(now);
  return {
    secret,
    timestamp,
    signature: signRequest(secret, timestamp, "GET", path),
    method: "GET",
    path,
    nowSeconds: now,
    ...overrides,
  };
}

describe("verifyRequest", () => {
  it("accepts a fresh, correctly signed request", () => {
    expect(verifyRequest(input())).toBe(true);
  });

  it("refuses when the deploy has no secret or a short one", () => {
    expect(verifyRequest(input({ secret: undefined }))).toBe(false);
    expect(verifyRequest(input({ secret: "  " }))).toBe(false);
    const short = "s".repeat(16);
    expect(verifyRequest(input({ secret: short, signature: signRequest(short, String(now), "GET", path) }))).toBe(false);
  });

  it("refuses a wrong key, path or method", () => {
    expect(verifyRequest(input({ signature: signRequest("b".repeat(64), String(now), "GET", path) }))).toBe(false);
    expect(verifyRequest(input({ path: "/api/other" }))).toBe(false);
    expect(verifyRequest(input({ method: "POST" }))).toBe(false);
  });

  it("refuses a stale or future timestamp", () => {
    expect(verifyRequest(input({ nowSeconds: now + MAX_SKEW_SECONDS + 1 }))).toBe(false);
    expect(verifyRequest(input({ nowSeconds: now - MAX_SKEW_SECONDS - 1 }))).toBe(false);
    expect(verifyRequest(input({ nowSeconds: now + MAX_SKEW_SECONDS }))).toBe(true);
  });

  it("refuses malformed headers", () => {
    expect(verifyRequest(input({ timestamp: null }))).toBe(false);
    expect(verifyRequest(input({ timestamp: "12a" }))).toBe(false);
    expect(verifyRequest(input({ signature: null }))).toBe(false);
    expect(verifyRequest(input({ signature: "zz" }))).toBe(false);
    expect(verifyRequest(input({ signature: "A".repeat(64) }))).toBe(false);
  });
});

describe("signRequest", () => {
  it("sends both header pairs and recognizes the existing WeGrocery contract", () => {
    const key = "test-secret-0123456789abcdef0123456789";
    const headers = signedStatsHeaders(key, 1700000000.9);
    expect(headers).toEqual({
      "x-flylabs-timestamp": "1700000000", "x-flylabs-signature": "5e7bea8559a8ce2f534d172c70f2af6d322ab0c94f4160c424ecac30b1641a59",
      "x-wegrocery-timestamp": "1700000000", "x-wegrocery-signature": "5e7bea8559a8ce2f534d172c70f2af6d322ab0c94f4160c424ecac30b1641a59",
    });
    const base = { secret: key, method: "GET", path, nowSeconds: 1700000000 };
    expect(verifiedContract(new Headers(headers), base)).toBe("flylabs");
    expect(verifiedContract(new Headers({ "x-wegrocery-timestamp": headers["x-wegrocery-timestamp"], "x-wegrocery-signature": headers["x-wegrocery-signature"] }), base)).toBe("wegrocery");
    expect(verifiedContract(new Headers(), base)).toBeNull();
  });
  // The vector of the Console's own test (WeGrocery console/lib/stats), made
  // with openssl: both sides check against the same number.
  //   printf '%s' '1700000000.GET./api/instance-stats' \
  //     | openssl dgst -sha256 -hmac 'test-secret-0123456789abcdef0123456789'
  it("matches the Console's known vector", () => {
    expect(signRequest("test-secret-0123456789abcdef0123456789", "1700000000", "GET", path)).toBe(
      "5e7bea8559a8ce2f534d172c70f2af6d322ab0c94f4160c424ecac30b1641a59",
    );
  });
});
