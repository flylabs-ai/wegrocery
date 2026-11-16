import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { emailOTP, magicLink } from "better-auth/plugins";
import { normalizeAuthOrigin, type AuthBaseURL } from "./hosts";
import { assertResolvedAuthPolicy, type ResolvedAuthPolicy } from "./policy";

type Advanced = NonNullable<BetterAuthOptions["advanced"]>;
export type AppAuthOptions = Pick<BetterAuthOptions, "appName" | "user" | "account" | "verification" | "hooks" | "databaseHooks" | "onAPIError" | "logger" | "telemetry"> & {
  session?: Pick<NonNullable<BetterAuthOptions["session"]>, "modelName" | "fields" | "additionalFields">;
  rateLimit?: Pick<NonNullable<BetterAuthOptions["rateLimit"]>, "modelName" | "fields">;
  advanced?: Pick<Advanced, "cookiePrefix" | "database"> & { ipAddress?: Omit<NonNullable<Advanced["ipAddress"]>, "disableIpTracking"> };
};
export type AuthDependencies<Plugins extends readonly BetterAuthPlugin[] = readonly BetterAuthPlugin[]> = {
  adapter: NonNullable<BetterAuthOptions["database"]>;
  secret: string;
  baseURL: string | AuthBaseURL;
  trustedOrigins: readonly string[];
  sendMagicLink?: Parameters<typeof magicLink>[0]["sendMagicLink"];
  sendVerificationOTP?: Parameters<typeof emailOTP>[0]["sendVerificationOTP"];
  google?: NonNullable<BetterAuthOptions["socialProviders"]>["google"];
  plugins?: Plugins;
  /** Compose app hooks/model names here, never spread overrides after this call. */
  appOptions?: AppAuthOptions;
};

/**
 * Plugin list as a tuple, so Better Auth keeps each app plugin's inferred
 * fields (for example `activeOrganizationId` from `organization`). A plain
 * array of a union loses them. Disabled managed methods stay in the type but
 * are absent at runtime, which only widens the inferred client API.
 */
export type AuthPlugins<Plugins extends readonly BetterAuthPlugin[]> = [ReturnType<typeof magicLink>, ReturnType<typeof emailOTP>, ...Plugins];

function appKeys(value: unknown, allowed: readonly string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("Application auth options cannot override protected settings");
  }
}

/** Construct the final betterAuth input, without calling the adapter or any sender. */
export function authOptions<const Plugins extends readonly BetterAuthPlugin[] = readonly []>(policy: ResolvedAuthPolicy, deps: AuthDependencies<Plugins>) {
  assertResolvedAuthPolicy(policy);
  const app = deps.appOptions === undefined ? {} : deps.appOptions;
  appKeys(app, ["appName", "user", "account", "verification", "hooks", "databaseHooks", "onAPIError", "logger", "telemetry", "session", "rateLimit", "advanced"]);
  appKeys(app.session, ["modelName", "fields", "additionalFields"]);
  appKeys(app.rateLimit, ["modelName", "fields"]);
  appKeys(app.advanced, ["cookiePrefix", "database", "ipAddress"]);
  appKeys(app.advanced?.ipAddress, ["ipAddressHeaders", "ipv6Subnet", "trustedProxies"]);
  const ipAddress = app.advanced?.ipAddress ? {
    ...app.advanced.ipAddress,
    ...(app.advanced.ipAddress.ipAddressHeaders ? { ipAddressHeaders: [...app.advanced.ipAddress.ipAddressHeaders] } : {}),
    ...(app.advanced.ipAddress.trustedProxies ? { trustedProxies: [...app.advanced.ipAddress.trustedProxies] } : {}),
  } : undefined;
  if (ipAddress) {
    if (ipAddress.ipAddressHeaders) Object.freeze(ipAddress.ipAddressHeaders);
    if (ipAddress.trustedProxies) Object.freeze(ipAddress.trustedProxies);
    Object.freeze(ipAddress);
  }
  if (!deps.adapter || typeof deps.secret !== "string" || !deps.secret) throw new Error("Auth requires an explicit adapter and secret");
  if (!Array.isArray(deps.trustedOrigins) || deps.trustedOrigins.length === 0) throw new Error("Auth requires trusted origins");
  const trustedOrigins = [...new Set(deps.trustedOrigins.map((value) => normalizeAuthOrigin(value, !policy.production)))];
  let baseURL: string | AuthBaseURL;
  if (typeof deps.baseURL === "string") {
    baseURL = normalizeAuthOrigin(deps.baseURL, !policy.production);
    if (!trustedOrigins.includes(baseURL)) throw new Error("Auth baseURL must be trusted");
  } else {
    const value = deps.baseURL;
    const fallback = normalizeAuthOrigin(value.fallback, !policy.production);
    if (!trustedOrigins.includes(fallback) || !["http", "https"].includes(value.protocol) || (policy.production && value.protocol !== "https")) throw new Error("Invalid auth baseURL");
    const hosts = new Set(trustedOrigins.map((origin) => new URL(origin).host));
    if (!Array.isArray(value.allowedHosts) || !value.allowedHosts.length || value.allowedHosts.some((host) => !hosts.has(host))) throw new Error("Auth baseURL hosts must be exact trusted hosts");
    baseURL = { fallback, protocol: value.protocol, allowedHosts: [...value.allowedHosts] };
    Object.freeze(baseURL.allowedHosts);
    Object.freeze(baseURL);
  }
  const secure = policy.production || (typeof baseURL === "string" ? baseURL.startsWith("https:") : baseURL.protocol === "https");
  if (policy.methods.magicLink && typeof deps.sendMagicLink !== "function") throw new Error("Auth requires sendMagicLink");
  if (policy.methods.emailOtp && typeof deps.sendVerificationOTP !== "function") throw new Error("Auth requires sendVerificationOTP");
  if (policy.methods.google && (!deps.google || typeof deps.google !== "object" || !deps.google.clientId || !deps.google.clientSecret)) throw new Error("Auth requires Google credentials when enabled");
  if (!policy.methods.google && deps.google) throw new Error("Google is not enabled in AuthPolicy");
  const disabledSender = async () => { throw new Error("Auth method is disabled"); };
  const magic = magicLink(Object.freeze({ ...policy.magicLink, sendMagicLink: deps.sendMagicLink ?? disabledSender }));
  const otp = emailOTP(Object.freeze({ ...policy.emailOtp, sendVerificationOTP: deps.sendVerificationOTP ?? disabledSender }));
  const managed = [magic, otp];
  const endpointNames = new Set(managed.flatMap((plugin) => Object.keys(plugin.endpoints)));
  const endpointPaths = new Set(managed.flatMap((plugin) => Object.values(plugin.endpoints).map((endpoint) => endpoint.path)));
  const extra = deps.plugins ?? [];
  const ids = new Set(["magic-link", "email-otp"]);
  for (const plugin of extra) {
    if (!plugin.id || ids.has(plugin.id)) throw new Error("Duplicate or reserved auth plugin");
    if (Object.entries(plugin.endpoints ?? {}).some(([name, endpoint]) => endpointNames.has(name) || (endpoint.path && endpointPaths.has(endpoint.path)))) throw new Error("App plugin cannot replace a managed auth endpoint");
    ids.add(plugin.id);
  }
  const plugins = [
    ...(policy.methods.magicLink ? [magic] : []),
    ...(policy.methods.emailOtp ? [otp] : []),
    ...extra,
  ] as unknown as AuthPlugins<Plugins>;
  for (const plugin of managed) { Object.freeze(plugin.endpoints); Object.freeze(plugin); }
  const attributes = Object.freeze({ secure, sameSite: policy.cookies.sameSite, httpOnly: true });
  const cookie = () => Object.freeze({ attributes });
  const cookies = Object.freeze({ session_token: cookie(), session_data: cookie(), account_data: cookie(), dont_remember: cookie() });
  const options = {
    ...app, secret: deps.secret, database: deps.adapter, baseURL, trustedOrigins,
    session: Object.freeze({ ...app.session, ...policy.session }),
    rateLimit: Object.freeze({ ...app.rateLimit, enabled: policy.rateLimit.enabled, storage: policy.rateLimit.storage, window: policy.rateLimit.window, max: policy.rateLimit.max, customRules: policy.rateLimit.rules }),
    advanced: Object.freeze({ ...app.advanced, ...(ipAddress ? { ipAddress } : {}), useSecureCookies: secure, disableOriginCheck: false, disableCSRFCheck: false, defaultCookieAttributes: attributes, cookies }),
    socialProviders: policy.methods.google ? { google: deps.google } : undefined,
    plugins,
  } satisfies BetterAuthOptions;
  Object.freeze(trustedOrigins);
  Object.freeze(plugins);
  return Object.freeze(options);
}
