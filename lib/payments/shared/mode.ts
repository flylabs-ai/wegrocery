export type StripeEnvironment = Record<string, string | undefined>;
export type StripeModeRefusal = "liveKeyOutsideProduction" | "testKeyInProduction";

/** Classify user input without exceptions; invalid formats are never test keys. */
export function stripeKeyMode(key: unknown): "live" | "test" | null {
  if (typeof key !== "string") return null;
  const match = /^(sk|rk)_(live|test)_[A-Za-z0-9]{8,}$/.exec(key.trim());
  if (!match) return null;
  return match[2] === "live" ? "live" : "test";
}

/** Strict configuration API. Use stripeKeyMode for inputs supplied by an admin. */
export function isLiveStripeKey(key: string): boolean {
  const mode = stripeKeyMode(key);
  if (mode === null) throw new Error("Invalid Stripe key");
  return mode === "live";
}

/** The app may override real production, for example to exclude a demo deploy. */
export function stripeModeRefusal(livemode: boolean, env: StripeEnvironment, options: { production?: boolean } = {}): StripeModeRefusal | null {
  const production = options.production ?? env.VERCEL_ENV === "production";
  if (livemode && !production) return "liveKeyOutsideProduction";
  if (!livemode && production) return "testKeyInProduction";
  return null;
}

export function eventModeMatches(event: { livemode?: unknown }, livemode: boolean): boolean {
  return typeof event.livemode === "boolean" && event.livemode === livemode;
}
