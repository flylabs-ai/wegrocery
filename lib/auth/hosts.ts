// The hosts Better Auth answers for and trusts (APP_BASE_URL and Vercel's
// production URL, a preview's own URLs, localhost in development) come from
// the FlyLabs Kit: lib/auth/kit/hosts.ts.

// A path to go to after signing in: only a local path, never another site.
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
