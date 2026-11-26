import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/auth/cookie";
import { loginPath, REQUEST_PATH_HEADER } from "@/lib/auth/login-url";
import { buildCsp, cspHeaderName, CSP_REPORT_PATH, generateNonce, type ExtensibleDirective } from "@/lib/security/csp";

// Every page response carries the Content Security Policy with a new nonce
// (lib/security/csp.ts, FlyLabs Kit module sicurezza). The same header on the
// request lets Next.js read the nonce and put it on its own scripts.
// Enforced since 1.52 after the Report-Only week (Playbook 11.2): the browser
// blocks what the policy does not allow and still reports it.
const CSP_HEADER = cspHeaderName("enforce");

// What WeGrocery adds to the kit's base policy:
// - img-src https: the group's logo may live on its own host;
// - font-src data: and worker-src blob: for inlined fonts and the PWA;
// - form-action: card payments leave through Stripe Checkout, Google sign-in
//   through Google's page;
// - frame-src https://vercel.live on preview deploys only (staging): the
//   Vercel Toolbar for comments. Production and other hosts keep 'none'.
function cspExtra(): Partial<Record<ExtensibleDirective, readonly string[]>> {
  return {
    "img-src": ["https:"],
    "font-src": ["data:"],
    "worker-src": ["blob:"],
    "form-action": ["https://checkout.stripe.com", "https://accounts.google.com"],
    ...(process.env.VERCEL_ENV === "preview" ? { "frame-src": ["https://vercel.live"] } : {}),
  };
}

function withCsp(request: NextRequest): NextResponse {
  const csp = buildCsp({
    nonce: generateNonce(),
    dev: process.env.NODE_ENV === "development",
    reportUri: CSP_REPORT_PATH,
    extra: cspExtra(),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER.toLowerCase(), csp);
  // The page asked for, for a session found expired by the page itself
  // (lib/auth/session.ts): always overwritten here, never the client's own.
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

// Only whether the session cookie is there, no database: a request without it
// goes to /login. Whether the session is valid, whose it is and whether it may
// open Admin, the page checks (lib/auth/session.ts). /login does not bounce a
// signed-in visitor from here: with a stale cookie, /login -> / -> /login
// would loop; the login page checks the real session.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // /aderisci: how to join; /gruppo: the group's public page, for people
  // who have no account yet.
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/aderisci" ||
    pathname === "/gruppo" ||
    hasSessionCookie(request.cookies)
  ) {
    return withCsp(request);
  }
  // The home without a session: /gruppo, which sends on to /login when the
  // group has no public page (the proxy never reads the database).
  if (pathname === "/") return NextResponse.redirect(new URL("/gruppo", request.url));
  return NextResponse.redirect(loginUrl(request));
}

// /login?next=<path and query> for a page opened without a session (a link in
// an email, a tap on a notification), so signing in lands where the member
// was going (PWA spec v1.2, WGR-06). Only for a GET of a page: an API call or
// a form post gets the bare /login. The login page validates next again.
function loginUrl(request: NextRequest): URL {
  const { pathname, search } = request.nextUrl;
  const page = request.method === "GET" && !pathname.startsWith("/api/");
  return new URL(page ? loginPath(pathname + search) : "/login", request.url);
}

// api/auth is Better Auth (its own allowlist), api/stripe/webhook is called by
// Stripe and authenticated by its signature, api/health is a public liveness
// check that returns no data, api/instance-stats answers only a request signed
// with INSTANCE_STATS_SECRET (404 otherwise), api/cron/open-cycles answers
// only Vercel Cron's CRON_SECRET (404 otherwise), as does api/cron/draft-reminders.
// api/unsubscribe acts only on a
// token signed with AUTH_SECRET (one-click unsubscribe from a notification email).
// api/csp-report takes the browser's CSP reports (lib/security/csp.ts), which
// come without a session. The uploaded logo
// (/brand/logo-*.png|jpg|webp) passes by its extension. mail/ holds the email
// logo (lib/email/layout.ts), which a mail client fetches with no session.
// Browsers can also request the app manifest and service worker without one.
export const config = {
  matcher: [
    "/((?!api/auth|api/stripe/webhook|api/health$|api/instance-stats$|api/cron/open-cycles$|api/cron/draft-reminders$|api/unsubscribe$|api/csp-report$|mail/|manifest.webmanifest$|sw\\.js$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
