export type AuthHostEnv = Record<string, string | undefined>;
export type AuthBaseURL = { allowedHosts: string[]; fallback: string; protocol: "http" | "https" };

/** Exact origins only. Never accept credentials, patterns or URL suffixes. */
export function normalizeAuthOrigin(value: string, allowLocalhost = false): string {
  try {
    if (!value.trim() || /[\s\\*?#@]/.test(value.trim())) throw new Error();
    const url = new URL(value.includes("://") ? value.trim() : `https://${value.trim()}`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (local && !allowLocalhost)) throw new Error();
    if (url.protocol !== "https:" && !(local && allowLocalhost && url.protocol === "http:")) throw new Error();
    return url.origin;
  } catch { throw new Error("Invalid auth origin"); }
}

export function resolveAuthHosts(env: AuthHostEnv, { additionalOrigins = [] }: { additionalOrigins?: readonly string[] } = {}) {
  const development = env.NODE_ENV === "development" && env.VERCEL_ENV !== "production";
  const origins = new Set<string>();
  // Both production origins are trusted; insertion order selects the fallback.
  for (const value of [env.APP_BASE_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (value?.trim()) origins.add(normalizeAuthOrigin(value, development));
  }
  for (const origin of additionalOrigins) origins.add(normalizeAuthOrigin(origin, development));
  if (env.VERCEL_ENV === "preview") {
    for (const value of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) if (value?.trim()) origins.add(normalizeAuthOrigin(value));
  }
  if (development) origins.add("http://localhost:3000");
  if (origins.size === 0) throw new Error("Auth requires an explicit production origin or development localhost");
  const trustedOrigins = [...origins];
  const baseURL: AuthBaseURL = {
    allowedHosts: [...new Set(trustedOrigins.map((origin) => new URL(origin).host))],
    fallback: trustedOrigins[0], protocol: development ? "http" : "https",
  };
  return { baseURL, trustedOrigins };
}

export function allowedHosts(env: AuthHostEnv, options?: { additionalOrigins?: readonly string[] }): string[] {
  return resolveAuthHosts(env, options).baseURL.allowedHosts;
}

export function fallbackBaseURL(env: AuthHostEnv, options?: { additionalOrigins?: readonly string[] }): string {
  return resolveAuthHosts(env, options).baseURL.fallback;
}
