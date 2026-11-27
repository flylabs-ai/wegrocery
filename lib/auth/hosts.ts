// The hosts Better Auth answers for and trusts (APP_BASE_URL and Vercel's
// production URL, a preview's own URLs, localhost in development) come from
// the FlyLabs Kit: lib/auth/kit/hosts.ts.

import { safeInternalPath as kitSafeInternalPath } from "@/lib/pwa/safe-internal-path";

export function safeInternalPath(value: unknown): string {
  return kitSafeInternalPath(value, "https://wegrocery.invalid");
}

// The login page as the destination of the redirect: going back to /login
// after signing in would only bounce to "/".
export function nextAfterLogin(value: unknown): string {
  const path = safeInternalPath(value);
  return path === "/login" || path.startsWith("/login/") || path.startsWith("/login?") ? "/" : path;
}
