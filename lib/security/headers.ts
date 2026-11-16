// The security headers sent on every response: pages, API routes and static
// files alike (next.config.ts headers()). The Content Security Policy is not
// here: it carries a per-request nonce, so the proxy sets it (csp.ts).
//
// - Strict-Transport-Security: two years, subdomains included. No `preload`:
//   that is a decision about the whole registrable domain, which belongs to
//   whoever owns it, not to the app.
// - X-Frame-Options: nothing embeds these pages. frame-ancestors says the same
//   in the CSP; this covers browsers that only know the old header.
// - Referrer-Policy: other sites (a payment page, a supplier link) learn the
//   origin, never the path.
// - Permissions-Policy: turns off what the apps never ask for. Card payments
//   are a redirect to the provider's own page, so `payment` stays off. Push
//   notifications are not a policy feature and keep working.

export interface HeaderEntry {
  key: string;
  value: string;
}

export const SECURITY_HEADERS: readonly HeaderEntry[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

// For private areas (an admin or staff panel): never cached, never indexed.
// A Server Component cannot set response headers, so next.config.ts does.
export const PRIVATE_AREA_HEADERS: readonly HeaderEntry[] = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** The rules for next.config.ts headers(): the security set everywhere, the private set under each prefix. */
export function securityHeaderRules(
  privatePrefixes: readonly string[] = [],
): { source: string; headers: HeaderEntry[] }[] {
  const rules = [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  for (const prefix of privatePrefixes) {
    const base = prefix.replace(/\/+$/, "");
    if (!/^\/[a-z0-9/_-]+$/i.test(base)) throw new Error(`Invalid private prefix: ${prefix}`);
    rules.push({ source: base, headers: [...PRIVATE_AREA_HEADERS] });
    rules.push({ source: `${base}/:path*`, headers: [...PRIVATE_AREA_HEADERS] });
  }
  return rules;
}
