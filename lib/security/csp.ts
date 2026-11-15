// Content Security Policy, sent by the proxy with a fresh nonce on every page
// request. For now it is Report-Only: the browser runs everything as before
// and only reports what the policy would have blocked to CSP_REPORT_PATH, so
// a week of reports can show what is missing before it is enforced.
//
// - script-src: the nonce and 'strict-dynamic'. Next.js reads the nonce from
//   the request's CSP header and puts it on its own scripts; scripts they load
//   are trusted through 'strict-dynamic'. The app has no inline script of its
//   own. 'unsafe-eval' only in development, where React needs it.
// - style-src keeps 'unsafe-inline': React style attributes and the brand's
//   theme variables (<style> in app/layout.tsx) cannot carry a nonce.
// - img-src allows https: because the brand logo may live on its own host.
// - form-action: card payments leave through Stripe Checkout and Google
//   sign-in through Google's page.
// - frame-ancestors 'none' says in CSP what X-Frame-Options: DENY says.
// - Reports go through report-uri only: with report-to as well, Chromium uses
//   the Reporting API, which batches reports and in testing never delivered
//   them; report-uri is sent at once by every browser.

export const CSP_REPORT_PATH = "/api/csp-report";

/** The header name while the policy only observes. */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

/** A random base64 value, new for every request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...(dev ? ["ws:"] : [])]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", "https://checkout.stripe.com", "https://accounts.google.com"]],
    ["frame-ancestors", ["'none'"]],
    ["report-uri", [CSP_REPORT_PATH]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

// Only the origin (or a keyword such as "inline" or "eval") of what was
// blocked, and only the path of the page: query strings and fragments can
// carry tokens, and nothing else of the report is kept.
function originOrKeyword(value: unknown): string {
  if (typeof value !== "string" || value === "") return "unknown";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : url.protocol.replace(/:$/, "");
  } catch {
    return value.slice(0, 40).replace(/[^a-z0-9-]/gi, "");
  }
}

function pathOnly(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    return new URL(value).pathname.slice(0, 200);
  } catch {
    return "unknown";
  }
}

function directiveOf(value: unknown): string {
  return typeof value === "string" ? value.split(" ")[0].slice(0, 40).replace(/[^a-z-]/gi, "") : "unknown";
}

/**
 * Reads both report formats: the old `report-uri` body
 * ({ "csp-report": {...} }) and the Reporting API list
 * ([{ type: "csp-violation", body: {...} }]).
 */
export function parseCspReports(payload: unknown): CspViolation[] {
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const entry of payload.slice(0, 20)) {
      if (entry && typeof entry === "object" && (entry as { type?: unknown }).type === "csp-violation") {
        const body = (entry as { body?: unknown }).body;
        if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === "object" && "csp-report" in payload) {
    const body = (payload as Record<string, unknown>)["csp-report"];
    if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
  }
  return bodies.map((b) => ({
    directive: directiveOf(b["effectiveDirective"] ?? b["effective-directive"] ?? b["violated-directive"]),
    blocked: originOrKeyword(b["blockedURL"] ?? b["blocked-uri"]),
    page: pathOnly(b["documentURL"] ?? b["document-uri"]),
  }));
}
