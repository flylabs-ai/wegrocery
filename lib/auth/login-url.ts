import { nextAfterLogin } from "./hosts";

// Login URLs that keep where the member was going (PWA spec v1.2, WGR-06).
// Pure: the client login form and the proxy use it.

// Set by proxy.ts on every request it lets through: the path and query asked
// for, so a page that finds the session expired can send to /login?next=.
export const REQUEST_PATH_HEADER = "x-wegrocery-path";

// Longer targets are dropped rather than cut: a cut query is a different page.
const MAX_NEXT = 1024;

// /login, with next=<target> when the target is a page of the app worth
// returning to (not "/", not /login itself, nothing that leaves the site).
export function loginPath(target: string | null | undefined): string {
  const next = nextAfterLogin(target);
  if (next === "/" || next !== target || next.length > MAX_NEXT) return "/login";
  return `/login?${new URLSearchParams({ next })}`;
}

// Where Better Auth sends a failed sign-in back: the login page with the
// error and, when there is one, the page the member was going to, so a
// second try still lands there. `next` must already be validated
// (nextAfterLogin).
export function loginErrorUrl(error: string | null, next: string): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (next !== "/") params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
