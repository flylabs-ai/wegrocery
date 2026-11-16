import { describe, expect, it } from "vitest";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP, magicLink } from "better-auth/plugins";
import { authOptions, type AppAuthOptions } from "./options";
import { resolveAuthPolicy } from "./policy";
import { resolveAuthHosts } from "./hosts";

const SECRET = "synthetic-compatibility-secret-for-memory-only";
const sendMagicLink = async () => {};
const sendVerificationOTP = async () => {};
const generateId = () => crypto.randomUUID();
const mapProfileToUser = () => ({ image: undefined });

// Security slices copied from the app config.ts files. Admission, DB hooks and
// email bodies are app-owned; use shared sentinels, never copied customer data.
function fixture(profile: "saas" | "white-label") {
  const whiteLabel = profile === "white-label";
  const adapter = memoryAdapter({});
  const models = whiteLabel
    ? { user: "authUsers", session: "authSessions", account: "authAccounts", verification: "authVerifications", rateLimit: "authRateLimits", prefix: "wegrocery" }
    : { user: "users", session: "sessions", account: "accounts", verification: "verifications", rateLimit: "rateLimits", prefix: "stellar" };
  const extras = { "/demo/sign-in": { window: 60, max: 30 }, ...(!whiteLabel ? { "/e2e/sign-in": { window: 60, max: 30 } } : {}) };
  const appOptions: AppAuthOptions = {
    user: { modelName: models.user }, account: { modelName: models.account, updateAccountOnSignIn: false, ...(whiteLabel ? { accountLinking: { enabled: true } } : {}) },
    verification: { modelName: models.verification }, session: { modelName: models.session }, rateLimit: { modelName: models.rateLimit },
    advanced: { cookiePrefix: models.prefix, database: { generateId }, ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] } },
    logger: { disabled: true },
  };
  const google = { clientId: "synthetic-client-id", clientSecret: "synthetic-client-secret", disableIdTokenSignIn: true, prompt: "select_account" as const, mapProfileToUser, ...(!whiteLabel ? { disableImplicitSignUp: true } : {}) };
  const original = {
    ...appOptions, secret: SECRET, database: adapter,
    baseURL: { allowedHosts: ["app.example.com", "alias.example.test"], fallback: "https://app.example.com", protocol: "https" as const },
    session: { modelName: models.session, expiresIn: 30 * 86400, updateAge: 86400 },
    rateLimit: { enabled: true, storage: "database" as const, modelName: models.rateLimit, customRules: { "/sign-in/magic-link": { window: 60, max: 3 }, "/sign-in/email-otp": { window: 60, max: whiteLabel ? 5 : 3 }, ...extras } },
    advanced: { ...appOptions.advanced, disableOriginCheck: false }, socialProviders: { google },
    plugins: [magicLink({ expiresIn: 900, storeToken: "hashed", sendMagicLink, ...(!whiteLabel ? { disableSignUp: false } : {}) }), emailOTP({ expiresIn: 900, otpLength: 6, storeOTP: "hashed", allowedAttempts: 3, sendVerificationOTP, ...(!whiteLabel ? { disableSignUp: true } : {}) })],
  } satisfies BetterAuthOptions;
  const hosts = resolveAuthHosts({ APP_BASE_URL: "https://app.example.com", VERCEL_PROJECT_PRODUCTION_URL: "alias.example.test", NODE_ENV: "production", VERCEL_ENV: "production" }, { additionalOrigins: whiteLabel ? [] : ["https://alias.example.test"] });
  const policy = resolveAuthPolicy({ profile, production: true, methods: { google: true }, emailOtp: { disableSignUp: !whiteLabel }, rateLimit: { rules: { "/sign-in/email-otp": { window: 60, max: whiteLabel ? 5 : 3 }, ...extras } } });
  const current = authOptions(policy, { adapter, secret: SECRET, ...hosts, google, appOptions, sendMagicLink, sendVerificationOTP });
  return { original, current };
}

describe("app configuration compatibility", () => {
  it.each(["white-label", "saas"] as const)("preserves %s security options and effective cookie attributes", async (profile) => {
    const { original, current } = fixture(profile);
    expect(current.session).toEqual(original.session);
    expect(current.rateLimit).toEqual({ window: 10, max: 100, ...original.rateLimit });
    expect(current.socialProviders).toEqual(original.socialProviders);
    expect(current.user).toEqual(original.user);
    expect(current.account).toEqual(original.account);
    expect(current.verification).toEqual(original.verification);
    expect(current.advanced.cookiePrefix).toBe(original.advanced.cookiePrefix);
    expect(current.advanced.database).toEqual(original.advanced.database);
    expect(current.advanced.ipAddress).toEqual(original.advanced.ipAddress);
    expect(current.advanced.disableOriginCheck).toBe(false);
    const settings = (plugins: typeof current.plugins) => plugins.map((plugin) => ({ ...plugin.options, disableSignUp: plugin.options.disableSignUp ?? false }));
    expect(settings(current.plugins)).toEqual(settings(original.plugins));
    const before = await betterAuth(original).$context;
    const after = await betterAuth(current).$context;
    expect(after.authCookies).toEqual(before.authCookies);
    expect(current.baseURL).toEqual(original.baseURL);
    expect(current.trustedOrigins).toEqual(["https://app.example.com", "https://alias.example.test"]);
  });
});
