// The hosts Better Auth answers for and trusts (APP_BASE_URL and Vercel's
// production URL, a preview's own URLs, localhost in development) come from
// the FlyLabs Kit: lib/auth/kit/hosts.ts.

const BASE = "https://wegrocery.invalid";

// A path to go to after signing in or after tapping a notification: only a
// path inside the app, never another site (PWA spec v1.2, WGR-06/PUSH-09; the
// same rules as Stellar Reviews' safeNext, headed for the kit's pwa 1.1 as
// safeInternalPath). Refused: anything not starting with "/", any backslash
// or control character (browsers drop tabs and newlines while parsing, so
// "/\t/evil.example" would become "//evil.example"), and anything that
// resolves to another origin. Anything refused becomes "/".
export function safeInternalPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    return new URL(value, BASE).origin === BASE ? value : "/";
  } catch {
    return "/";
  }
}

// The login page as the destination of the redirect: going back to /login
// after signing in would only bounce to "/".
export function nextAfterLogin(value: unknown): string {
  const path = safeInternalPath(value);
  return path === "/login" || path.startsWith("/login/") || path.startsWith("/login?") ? "/" : path;
}
