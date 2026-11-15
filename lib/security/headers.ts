// The security headers sent on every response: pages, API routes and static
// files alike (next.config.ts). The Content Security Policy is not here: it
// carries a per-request nonce, so it will be set by the proxy.
//
// - Strict-Transport-Security: two years, subdomains included. No `preload`:
//   that is a decision about the whole registrable domain, which belongs to
//   whoever owns it, not to the app.
// - X-Frame-Options: nothing embeds these pages. frame-ancestors will say the
//   same in the CSP; this covers browsers that only know the old header.
// - Referrer-Policy: other sites (the payment page, a supplier link) learn the
//   origin, never the path.
// - Permissions-Policy: turns off what the app never asks for. Card payments
//   are a redirect to the provider's own page, so `payment` stays off here.
//   Push notifications are not a policy feature and keep working.
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];
