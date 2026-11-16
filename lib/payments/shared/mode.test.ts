import { describe, expect, it } from "vitest";
import { eventModeMatches, isLiveStripeKey, stripeKeyMode, stripeModeRefusal } from "./mode";

// App adapter, also shown verbatim in README.
function checkPastedKey(input: string, env: Record<string, string | undefined>) {
  const key = input.trim();
  if (!key) return { error: "empty" as const };
  if (/^pk_/.test(key)) return { error: "publishable" as const };
  const mode = stripeKeyMode(key);
  if (mode === null) return { error: "format" as const };
  const livemode = mode === "live";
  const refusal = stripeModeRefusal(livemode, env, {
    production: env.VERCEL_ENV === "production" && env.DEMO_MODE !== "true",
  });
  return refusal ? { error: refusal } : { key, livemode };
}

describe("Stripe key and deployment mode", () => {
  it("returns null for non-string input instead of throwing", () => {
    for (const value of [null, undefined, 42, {}, [], Symbol("example")]) expect(stripeKeyMode(value)).toBeNull();
  });
  it.each(["sk", "rk"])("classifies %s keys without throwing for invalid input", (prefix) => {
    expect(stripeKeyMode(` ${prefix}_live_${"x".repeat(24)} `)).toBe("live");
    expect(stripeKeyMode(`${prefix}_test_${"x".repeat(24)}`)).toBe("test");
    for (const key of ["", "garbage", `pk_test_${"x".repeat(24)}`, `${prefix}_live_`, `${prefix}_test_x!`, `${prefix}_test_1234567`]) {
      expect(stripeKeyMode(key)).toBeNull();
    }
  });
  it.each(["sk", "rk"])("classifies valid %s keys and rejects other formats", (prefix) => {
    expect(isLiveStripeKey(` ${prefix}_live_${"x".repeat(24)} `)).toBe(true);
    expect(isLiveStripeKey(`${prefix}_test_${"x".repeat(24)}`)).toBe(false);
    for (const key of ["", "garbage", `pk_test_${"x".repeat(24)}`, `${prefix}_live_`, `${prefix}_test_x!`, `${prefix}_test_1234567`]) {
      expect(() => isLiveStripeKey(key)).toThrow("Invalid Stripe key");
    }
  });
  it("maps malformed admin keys to the app's format error and keeps mode refusals", () => {
    expect(checkPastedKey("garbage", { VERCEL_ENV: "production" })).toEqual({ error: "format" });
    expect(checkPastedKey("", {})).toEqual({ error: "empty" });
    expect(checkPastedKey("pk_" + "test_" + "x".repeat(24), {})).toEqual({ error: "publishable" });
    const key = "rk_" + "test_" + "x".repeat(24);
    expect(checkPastedKey(key, { VERCEL_ENV: "production" })).toEqual({ error: "testKeyInProduction" });
    expect(checkPastedKey(key, { VERCEL_ENV: "production", DEMO_MODE: "true" })).toEqual({ key, livemode: false });
  });
  it("preserves both app environment matrices, including the production demo", () => {
    for (const vercel of [undefined, "development", "preview", "production"]) {
      for (const demo of [undefined, "false", "true"]) {
        const env = { VERCEL_ENV: vercel, DEMO_MODE: demo };
        for (const prefix of ["sk", "rk"]) for (const mode of ["live", "test"]) {
          const live = isLiveStripeKey(`${prefix}_${mode}_${"x".repeat(24)}`);
          const expected = (production: boolean) => live === production ? null : live ? "liveKeyOutsideProduction" : "testKeyInProduction";
          expect(stripeModeRefusal(live, env)).toBe(expected(vercel === "production"));
          expect(stripeModeRefusal(live, env, { production: vercel === "production" && demo !== "true" })).toBe(expected(vercel === "production" && demo !== "true"));
        }
      }
    }
  });
  it("requires the event's mode to match the configured key", () => {
    expect(eventModeMatches({ livemode: false }, false)).toBe(true);
    expect(eventModeMatches({ livemode: true }, false)).toBe(false);
    expect(eventModeMatches({}, false)).toBe(false);
  });
});
