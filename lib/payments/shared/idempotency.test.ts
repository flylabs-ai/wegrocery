import { describe, expect, it } from "vitest";
import { idempotencyKey } from "./idempotency";

describe("operation idempotency", () => {
  it("is deterministic, bounded and only uses portable ASCII characters", () => {
    const key = idempotencyKey("customer", "example", "revision-1");
    expect(key).toBe(idempotencyKey("customer", "example", "revision-1"));
    expect(key).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(key.length).toBeLessThanOrEqual(255);
    expect(idempotencyKey("x".repeat(300), "y".repeat(1000)).length).toBeLessThanOrEqual(255);
    expect(idempotencyKey("a", "b:c")).not.toBe(idempotencyKey("a:b", "c"));
    expect(idempotencyKey("a", "b")).not.toBe(idempotencyKey("a", "c"));
    expect(key).not.toContain("example");
  });
  it("rejects empty scopes and parts instead of collapsing operations", () => {
    for (const parts of [[""], [" "], ["scope", ""], ["scope", "  "]]) expect(() => idempotencyKey(parts[0], ...parts.slice(1))).toThrow();
  });
});
