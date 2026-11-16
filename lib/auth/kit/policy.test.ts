import { describe, expect, it } from "vitest";
import { resolveAuthPolicy, type AuthPolicy } from "./policy";

const input: AuthPolicy = { profile: "white-label", production: true };
describe("resolveAuthPolicy", () => {
  it("resolves the shared limits without environment reads", () => {
    const policy = resolveAuthPolicy(input);
    expect(policy.session).toEqual({ expiresIn: 30 * 86400, updateAge: 86400 });
    expect(policy.magicLink).toEqual({ expiresIn: 900, storeToken: "hashed", disableSignUp: false });
    expect(policy.emailOtp).toEqual({ expiresIn: 900, storeOTP: "hashed", otpLength: 6, allowedAttempts: 3, disableSignUp: false });
    expect(policy.rateLimit).toMatchObject({ enabled: true, storage: "database", window: 10, max: 100 });
    expect(policy.cookies).toEqual({ sameSite: "lax", secureInProduction: true });
    expect(policy.methods).toEqual({ magicLink: true, emailOtp: true, google: false });
  });
  it("accepts shorter sessions, supported expiry and tighter rate limits", () => {
    const policy = resolveAuthPolicy({ ...input, session: { expiresIn: 3600, updateAge: 600 }, magicLink: { expiresIn: 300, disableSignUp: true }, emailOtp: { expiresIn: 600, disableSignUp: true }, methods: { google: true }, rateLimit: { max: 50, window: 20, rules: { "/sign-in/email-otp": { max: 3, window: 60 }, "/demo/sign-in": { max: 30, window: 60 } } } });
    expect(policy.session.expiresIn).toBe(3600);
    expect(policy.magicLink.expiresIn).toBe(300);
    expect(policy.emailOtp.disableSignUp).toBe(true);
    expect(policy.rateLimit.rules["/sign-in/email-otp"]).toEqual({ max: 3, window: 60 });
  });
  it.each([
    { session: { expiresIn: 30 * 86400 + 1 } }, { session: { expiresIn: 0 } },
    { session: { updateAge: -1 } }, { session: { expiresIn: 600, updateAge: 600 } },
    { magicLink: { expiresIn: 299 } }, { emailOtp: { expiresIn: 901 } },
    { rateLimit: { enabled: false } }, { rateLimit: { max: 101 } }, { rateLimit: { window: 9 } },
    { rateLimit: { rules: { "/sign-in/magic-link": { window: 60, max: 4 } } } },
    { rateLimit: { rules: { "/sign-in/email-otp": { window: 59, max: 5 } } } },
    { rateLimit: { rules: { "/sign-in/*": { window: 60, max: 1 } } } },
  ])("rejects values outside the bounds at startup: %j", (invalid) => {
    expect(() => resolveAuthPolicy({ ...input, ...invalid } as AuthPolicy)).toThrow();
  });
  it("rejects runtime attempts to supply fixed settings, not just TypeScript errors", () => {
    for (const invalid of [{ storeToken: "plain" }, { emailOtp: { storeOTP: "plain" } }, { emailOtp: { otpLength: 5 } }, { emailOtp: { allowedAttempts: 4 } }, { rateLimit: { storage: "memory" } }, { cookies: { sameSite: "none" } }, { methods: { password: true } }]) {
      expect(() => resolveAuthPolicy({ ...input, ...invalid } as AuthPolicy)).toThrow();
    }
    expect(() => resolveAuthPolicy({ ...input, production: "true" } as unknown as AuthPolicy)).toThrow();
    for (const invalid of [{ session: { expiresIn: null } }, { methods: { google: null } }, { rateLimit: { enabled: null } }]) {
      expect(() => resolveAuthPolicy({ ...input, ...invalid } as unknown as AuthPolicy)).toThrow();
    }
  });
  it("allows a limiter in tests and freezes the resolved security values", () => {
    expect(resolveAuthPolicy({ ...input, production: false }).rateLimit.enabled).toBe(false);
    const policy = resolveAuthPolicy({ ...input, production: false, rateLimit: { enabled: true } });
    expect(policy.rateLimit.enabled).toBe(true);
    expect(() => Object.assign(policy.magicLink, { storeToken: "plain" })).toThrow();
    expect(() => Object.assign(policy.rateLimit.rules["/sign-in/magic-link"], { max: 99 })).toThrow();
  });
});
