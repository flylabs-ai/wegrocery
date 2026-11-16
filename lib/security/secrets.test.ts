import { describe, expect, it } from "vitest";
import { secretUsable, timingSafeEqualString } from "./secrets";

describe("timingSafeEqualString", () => {
  it("matches only the exact secret", () => {
    expect(timingSafeEqualString("s3cret", "s3cret")).toBe(true);
    expect(timingSafeEqualString("s3cret ", "s3cret")).toBe(false);
    expect(timingSafeEqualString("s3cre", "s3cret")).toBe(false);
    expect(timingSafeEqualString("a much longer guess than the secret", "s3cret")).toBe(false);
  });

  it("matches nothing without a secret, an empty guess included", () => {
    expect(timingSafeEqualString("", "")).toBe(false);
    expect(timingSafeEqualString("x", undefined)).toBe(false);
    expect(timingSafeEqualString(null, "s3cret")).toBe(false);
    expect(timingSafeEqualString(undefined, "s3cret")).toBe(false);
  });
});

describe("secretUsable", () => {
  it("needs at least 32 characters by default, spaces around not counted", () => {
    expect(secretUsable("s".repeat(32))).toBe(true);
    expect(secretUsable(` ${"s".repeat(31)} `)).toBe(false);
    expect(secretUsable(undefined)).toBe(false);
    expect(secretUsable("short", 5)).toBe(true);
  });
});
