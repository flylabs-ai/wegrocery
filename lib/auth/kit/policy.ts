export type AuthRateRule = { window: number; max: number };
export type AuthPolicy = {
  profile: "saas" | "white-label";
  /** NODE_ENV === production in both apps, including Vercel previews. */
  production: boolean;
  session?: { expiresIn?: number; updateAge?: number };
  magicLink?: { expiresIn?: number; disableSignUp?: boolean };
  emailOtp?: { expiresIn?: number; disableSignUp?: boolean };
  methods?: { magicLink?: boolean; emailOtp?: boolean; google?: boolean };
  rateLimit?: { enabled?: boolean; window?: number; max?: number; rules?: Record<string, AuthRateRule> };
};

const resolvedPolicies = new WeakSet<object>();
const DAY = 86400;

function keys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key)) || Object.values(value).some((entry) => entry === null)) {
    throw new Error("Unsupported auth policy option");
  }
}
function integer(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid auth ${label}`);
  return value;
}
function boolean(value: boolean): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid auth boolean option");
  return value;
}

/** Invalid input fails at startup; fixed security settings are never inputs. */
export function resolveAuthPolicy(input: AuthPolicy) {
  keys(input, ["profile", "production", "session", "magicLink", "emailOtp", "methods", "rateLimit"]);
  if (!["saas", "white-label"].includes(input.profile)) throw new Error("Invalid auth profile");
  boolean(input.production);
  for (const [value, allowed] of [
    [input.session, ["expiresIn", "updateAge"]], [input.magicLink, ["expiresIn", "disableSignUp"]],
    [input.emailOtp, ["expiresIn", "disableSignUp"]], [input.methods, ["magicLink", "emailOtp", "google"]],
    [input.rateLimit, ["enabled", "window", "max", "rules"]],
  ] as const) if (value !== undefined) keys(value, allowed);

  const expiresIn = integer(input.session?.expiresIn ?? 30 * DAY, 1, 30 * DAY, "session expiry");
  const updateAge = integer(input.session?.updateAge ?? DAY, 0, expiresIn - 1, "session updateAge");
  const enabled = boolean(input.rateLimit?.enabled ?? input.production);
  if (input.production && !enabled) throw new Error("Auth rate limiting is required in production");
  const window = integer(input.rateLimit?.window ?? 10, 10, Number.MAX_SAFE_INTEGER, "rate window");
  const max = integer(input.rateLimit?.max ?? 100, 1, 100, "rate max");
  const defaults: Record<string, AuthRateRule> = {
    "/sign-in/magic-link": { window: Math.max(60, window), max: Math.min(3, max) },
    "/sign-in/email-otp": { window: Math.max(60, window), max: Math.min(5, max) },
  };
  const rules: Record<string, AuthRateRule> = { ...defaults };
  if (input.rateLimit?.rules !== undefined) {
    const values = input.rateLimit.rules;
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Invalid auth rate rules");
    for (const [path, rule] of Object.entries(values)) {
      if (!/^\/[a-zA-Z0-9_/-]+$/.test(path)) throw new Error("Invalid auth rate rule path");
      keys(rule, ["window", "max"]);
      const baseline = defaults[path] ?? { window, max };
      rules[path] = {
        window: integer(rule.window, baseline.window, Number.MAX_SAFE_INTEGER, "rate rule window"),
        max: integer(rule.max, 1, baseline.max, "rate rule max"),
      };
    }
  }
  for (const rule of Object.values(rules)) Object.freeze(rule);
  const policy = {
    profile: input.profile, production: input.production,
    session: Object.freeze({ expiresIn, updateAge }),
    methods: Object.freeze({ magicLink: boolean(input.methods?.magicLink ?? true), emailOtp: boolean(input.methods?.emailOtp ?? true), google: boolean(input.methods?.google ?? false) }),
    magicLink: Object.freeze({ expiresIn: integer(input.magicLink?.expiresIn ?? 900, 300, 900, "magic link expiry"), storeToken: "hashed" as const, disableSignUp: boolean(input.magicLink?.disableSignUp ?? false) }),
    emailOtp: Object.freeze({ expiresIn: integer(input.emailOtp?.expiresIn ?? 900, 300, 900, "OTP expiry"), storeOTP: "hashed" as const, otpLength: 6 as const, allowedAttempts: 3 as const, disableSignUp: boolean(input.emailOtp?.disableSignUp ?? false) }),
    rateLimit: Object.freeze({ enabled, storage: "database" as const, window, max, rules: Object.freeze(rules) }),
    cookies: Object.freeze({ sameSite: "lax" as const, secureInProduction: true as const }),
  };
  resolvedPolicies.add(policy);
  return Object.freeze(policy);
}

export type ResolvedAuthPolicy = ReturnType<typeof resolveAuthPolicy>;

export function assertResolvedAuthPolicy(policy: ResolvedAuthPolicy): void {
  if (!resolvedPolicies.has(policy)) throw new Error("Use resolveAuthPolicy before authOptions");
}
