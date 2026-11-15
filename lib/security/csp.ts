// Content Security Policy, built per request by the app's proxy with a fresh
// nonce. Pure: no env reads, the proxy passes what it needs, so tests see the
// exact header.
//
// - script-src: the nonce and 'strict-dynamic'. Next.js reads the nonce from
//   the request's CSP header and puts it on its own scripts; the chunks they
//   load are trusted through 'strict-dynamic'. 'unsafe-eval' only in
//   development, where React needs it. Apps add nothing here.
// - style-src keeps 'unsafe-inline': React style attributes and theme
//   variables cannot carry a nonce.
// - frame-ancestors 'none' says in CSP what X-Frame-Options: DENY says.
// - Reports: report-uri only. With report-to as well, Chromium uses the
//   Reporting API, which batches reports and in testing never delivered them.
// - What differs between apps (an image host, a payment or sign-in page that
//   forms post to, a Sentry DSN) enters through `extra`, `reportUri` and
//   `sentryDsn`.

export type CspMode = "report-only" | "enforce";

/** The header name: observe first, then enforce (Playbook 11). */
export function cspHeaderName(mode: CspMode): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** The path of the app's own report endpoint (csp-report.ts). */
export const CSP_REPORT_PATH = "/api/csp-report";

export type ExtensibleDirective =
  | "img-src"
  | "font-src"
  | "connect-src"
  | "worker-src"
  | "frame-src"
  | "form-action";

export interface CspOptions {
  nonce: string;
  dev?: boolean;
  /** Sources added to the base directives, e.g. { "form-action": ["https://checkout.stripe.com"] }. */
  extra?: Partial<Record<ExtensibleDirective, readonly string[]>>;
  /** Where browsers report violations, usually CSP_REPORT_PATH. */
  reportUri?: string | null;
  /** Sentry's DSN: its ingest origin joins connect-src and its security endpoint receives reports. */
  sentryDsn?: string | null;
}

// A source is one token: no whitespace, no ';' or ',' that would end the
// directive or the header. Anything else is a configuration error.
const SOURCE = /^[^\s;,]+$/;

function checkSources(values: readonly string[]): string[] {
  for (const value of values) {
    if (!SOURCE.test(value)) throw new Error(`Invalid CSP source: ${JSON.stringify(value)}`);
  }
  return [...values];
}

export interface SentryTarget {
  origin: string;
  reportUri: string;
}

// "https://<key>@<host>/<project>" -> the ingest origin and
// "https://<host>/api/<project>/security/?sentry_key=<key>" (Sentry's format
// for CSP reports). A malformed DSN gives null: the policy goes out without
// Sentry rather than with a broken directive.
export function sentryTarget(dsn: string | null | undefined): SentryTarget | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  const key = url.username;
  const project = url.pathname.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  if (url.protocol !== "https:" || !key || !/^\d+$/.test(project)) return null;
  // A self-hosted Sentry may live under a path: keep it before /api.
  const prefix = url.pathname.replace(/\/+$/, "").slice(0, -project.length).replace(/\/+$/, "");
  return {
    origin: url.origin,
    reportUri: `${url.origin}${prefix}/api/${project}/security/?sentry_key=${encodeURIComponent(key)}`,
  };
}

export function buildCsp({ nonce, dev = false, extra = {}, reportUri, sentryDsn }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error("Invalid CSP nonce");
  const sentry = sentryTarget(sentryDsn);
  const add = (name: ExtensibleDirective) => checkSources(extra[name] ?? []);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...add("img-src")]],
    ["font-src", ["'self'", ...add("font-src")]],
    ["connect-src", ["'self'", ...(dev ? ["ws:"] : []), ...(sentry ? [sentry.origin] : []), ...add("connect-src")]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'", ...add("worker-src")]],
    ["frame-src", add("frame-src").length ? add("frame-src") : ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...add("form-action")]],
    ["frame-ancestors", ["'none'"]],
  ];
  const reports = [...(reportUri ? checkSources([reportUri]) : []), ...(sentry ? [sentry.reportUri] : [])];
  if (reports.length) directives.push(["report-uri", reports]);
  return directives.map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`).join("; ");
}

/** 128 random bits in base64, new for every request. Works in Node and Edge. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
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
    return value.slice(0, 40).replace(/[^a-z0-9-]/gi, "") || "unknown";
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
  return typeof value === "string" ? value.split(" ")[0].slice(0, 40).replace(/[^a-z-]/gi, "") || "unknown" : "unknown";
}

/**
 * Reads both report formats: the old `report-uri` body
 * ({ "csp-report": {...} }) and the Reporting API list
 * ([{ type: "csp-violation", body: {...} }], at most 20 entries).
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
