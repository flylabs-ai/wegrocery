import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { authOptions, type AuthDependencies } from "./options";
import { resolveAuthPolicy } from "./policy";

const policy = resolveAuthPolicy({ profile: "white-label", production: true });
const dependencies = (): AuthDependencies => ({
  adapter: memoryAdapter({}), secret: "synthetic-test-secret-for-options-only",
  baseURL: "https://app.example.com", trustedOrigins: ["https://app.example.com"],
  sendMagicLink: async () => {}, sendVerificationOTP: async () => {},
});
describe("authOptions", () => {
  it("constructs the protected options without opening the adapter", () => {
    const adapter = vi.fn(memoryAdapter({}));
    const options = authOptions(policy, { ...dependencies(), adapter, appOptions: { session: { modelName: "authSessions" }, rateLimit: { modelName: "authRateLimits" }, advanced: { cookiePrefix: "example", ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] } } } });
    expect(adapter).not.toHaveBeenCalled();
    expect(options.database).toBe(adapter);
    expect(options.session).toEqual({ modelName: "authSessions", expiresIn: 2592000, updateAge: 86400 });
    expect(options.rateLimit).toMatchObject({ enabled: true, storage: "database", modelName: "authRateLimits" });
    expect(options.advanced).toMatchObject({ cookiePrefix: "example", useSecureCookies: true, disableOriginCheck: false, disableCSRFCheck: false, cookies: { session_token: { attributes: { secure: true, sameSite: "lax", httpOnly: true } } } });
    expect(options.plugins.map((plugin) => plugin.id)).toEqual(["magic-link", "email-otp"]);
    expect(options.plugins[0].options).toMatchObject({ storeToken: "hashed", expiresIn: 900 });
    expect(options.plugins[1].options).toMatchObject({ storeOTP: "hashed", otpLength: 6, allowedAttempts: 3 });
    expect(() => Object.assign(options.advanced.cookies.session_token.attributes, { secure: false })).toThrow();
  });
  it.each([
    { plugins: [{ id: "magic-link", options: { storeToken: "plain" } }] },
    { session: { expiresIn: 99999999 } }, { rateLimit: { storage: "memory" } },
    { rateLimit: { enabled: false } }, { rateLimit: { customStorage: {} } },
    { advanced: { cookies: { session_token: { attributes: { secure: false } } } } },
    { advanced: { useSecureCookies: false } }, { advanced: { defaultCookieAttributes: { sameSite: "none" } } },
    { advanced: { disableOriginCheck: true } }, { advanced: { disableCSRFCheck: true } },
    { advanced: { ipAddress: { disableIpTracking: true } } },
    { trustedOrigins: ["*"] }, { socialProviders: {} },
  ])("rejects application overrides of protected settings: %j", (appOptions) => {
    expect(() => authOptions(policy, { ...dependencies(), appOptions } as AuthDependencies)).toThrow();
  });
  it("rejects managed-plugin duplicates, forged policy and an unsafe production URL", () => {
    expect(() => authOptions(policy, { ...dependencies(), plugins: [{ id: "magic-link" }] })).toThrow();
    expect(() => authOptions({ ...policy }, dependencies())).toThrow(/resolveAuthPolicy/);
    expect(() => authOptions(policy, { ...dependencies(), baseURL: "http://localhost:3000" })).toThrow();
    expect(() => authOptions(policy, { ...dependencies(), trustedOrigins: ["https://*.example.com"] })).toThrow();
    const renamed = { ...magicLink({ storeToken: "plain", sendMagicLink: async () => {} }), id: "renamed-plugin" };
    expect(() => authOptions(policy, { ...dependencies(), plugins: [renamed] })).toThrow();
    const options = authOptions(policy, dependencies());
    expect(() => Object.assign(options.plugins[0], { options: { storeToken: "plain" } })).toThrow();
  });
  it("copies app IP options so later mutations cannot turn the limiter off", () => {
    const ipAddress = { ipAddressHeaders: ["x-vercel-forwarded-for"] };
    const options = authOptions(policy, { ...dependencies(), appOptions: { advanced: { ipAddress } } });
    Object.assign(ipAddress, { disableIpTracking: true });
    ipAddress.ipAddressHeaders.push("untrusted-example-header");
    expect(options.advanced.ipAddress).not.toHaveProperty("disableIpTracking");
    expect(options.advanced.ipAddress?.ipAddressHeaders).toEqual(["x-vercel-forwarded-for"]);
  });
  it("keeps app plugin order and supports Google only when selected", () => {
    const plugins = [{ id: "demo-login" }, { id: "e2e-login" }, { id: "next-cookies" }];
    const options = authOptions(resolveAuthPolicy({ profile: "saas", production: true, methods: { magicLink: false, emailOtp: false, google: true } }), { ...dependencies(), plugins, google: { clientId: "synthetic-id", clientSecret: "synthetic-secret", disableIdTokenSignIn: true } });
    expect(options.plugins.map((plugin) => plugin.id)).toEqual(plugins.map((plugin) => plugin.id));
    expect(options.socialProviders?.google).toMatchObject({ clientId: "synthetic-id", disableIdTokenSignIn: true });
    expect(() => authOptions(resolveAuthPolicy({ profile: "saas", production: true, methods: { google: true } }), dependencies())).toThrow();
  });
});

describe("authOptions plugin types", () => {
  it("keeps the fields an app plugin adds to the session type", async () => {
    const { betterAuth } = await import("better-auth");
    const { organization } = await import("better-auth/plugins");
    const auth = betterAuth(authOptions(policy, { ...dependencies(), plugins: [organization()] }));
    // Type-level only: $Infer has no runtime value.
    expectTypeOf(auth).toHaveProperty("$Infer").toHaveProperty("Session").toHaveProperty("session").toHaveProperty("activeOrganizationId");
  });
});
