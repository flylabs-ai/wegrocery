import { describe, expect, it } from "vitest";
import { stripeHeaders } from "./api";

describe("injected Stripe API headers", () => {
  const secretKey = "sk_" + "test_" + "x".repeat(24);
  it("preserves the app's pinned version and optional operation key", () => {
    expect(stripeHeaders({ secretKey, apiVersion: "2025-03-31.basil", idempotencyKey: "operation_example" })).toEqual({ Authorization: `Bearer ${secretKey}`, "Stripe-Version": "2025-03-31.basil", "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "operation_example" });
    expect(stripeHeaders({ secretKey, apiVersion: "2025-03-31.basil" })).not.toHaveProperty("Idempotency-Key");
  });
  it("rejects empty or injected headers without returning the rejected value", () => {
    for (const apiVersion of ["", " ", "version\r\nx: y", "version\n"]) expect(() => stripeHeaders({ secretKey, apiVersion })).toThrow("Invalid Stripe API version");
    expect(() => stripeHeaders({ secretKey: "garbage", apiVersion: "example" })).toThrow();
    for (const key of ["", "x".repeat(256), "bad\nkey", "bad\n"]) expect(() => stripeHeaders({ secretKey, apiVersion: "example", idempotencyKey: key })).toThrow("Invalid idempotency key");
  });
});
