import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName, CSP_REPORT_PATH, generateNonce, parseCspReports, sentryTarget } from "./csp";

const directives = (csp: string) =>
  Object.fromEntries(csp.split("; ").map((part) => [part.split(" ")[0], part.split(" ").slice(1)]));

describe("buildCsp", () => {
  it("trusts scripts only through this request's nonce", () => {
    const d = directives(buildCsp({ nonce: "abc123==" }));
    expect(d["script-src"]).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(buildCsp({ nonce: "n" })).not.toContain("unsafe-eval");
    expect(buildCsp({ nonce: "n", dev: true })).toContain("'unsafe-eval'");
  });

  it("refuses framing, plugins and a foreign base", () => {
    const d = directives(buildCsp({ nonce: "n" }));
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("has no report directive unless asked, and never report-to", () => {
    const d = directives(buildCsp({ nonce: "n" }));
    expect(d["report-uri"]).toBeUndefined();
    expect(buildCsp({ nonce: "n", reportUri: CSP_REPORT_PATH, sentryDsn: "https://k@o1.ingest.sentry.io/42" })).not.toContain("report-to");
  });

  it("gives WeGrocery's policy of 1.47.2 unchanged", () => {
    const csp = buildCsp({
      nonce: "abc",
      reportUri: CSP_REPORT_PATH,
      extra: {
        "img-src": ["https:"],
        "font-src": ["data:"],
        "worker-src": ["blob:"],
        "form-action": ["https://checkout.stripe.com", "https://accounts.google.com"],
      },
    });
    expect(csp).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; " +
        "worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self' https://checkout.stripe.com https://accounts.google.com; frame-ancestors 'none'; " +
        "report-uri /api/csp-report",
    );
  });

  it("gives Stellar's policy with Sentry unchanged", () => {
    const csp = buildCsp({
      nonce: "abc",
      sentryDsn: "https://key@o1.ingest.sentry.io/42",
      extra: { "form-action": ["https://checkout.stripe.com", "https://billing.stripe.com"] },
    });
    expect(csp).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://o1.ingest.sentry.io; " +
        "manifest-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; " +
        "report-uri https://o1.ingest.sentry.io/api/42/security/?sentry_key=key",
    );
  });

  it("opens frame-src only to the sources an app names", () => {
    expect(directives(buildCsp({ nonce: "n", extra: { "frame-src": ["https://js.stripe.com"] } }))["frame-src"]).toEqual([
      "https://js.stripe.com",
    ]);
  });

  it("adds ws: for development reloads only", () => {
    expect(directives(buildCsp({ nonce: "n", dev: true }))["connect-src"]).toEqual(["'self'", "ws:"]);
  });

  it("writes each source once", () => {
    expect(directives(buildCsp({ nonce: "n", extra: { "img-src": ["data:", "https:"] } }))["img-src"]).toEqual([
      "'self'", "data:", "blob:", "https:",
    ]);
  });

  it("refuses a source or nonce that would break out of its directive", () => {
    expect(() => buildCsp({ nonce: "n", extra: { "img-src": ["https://a.example; script-src *"] } })).toThrow(/Invalid CSP source/);
    expect(() => buildCsp({ nonce: "n", extra: { "connect-src": ["a,b"] } })).toThrow(/Invalid CSP source/);
    expect(() => buildCsp({ nonce: "n", reportUri: "/x y" })).toThrow(/Invalid CSP source/);
    expect(() => buildCsp({ nonce: "n' 'unsafe-inline" })).toThrow(/nonce/);
  });

  it("is one line with no stray whitespace, as a header must be", () => {
    const csp = buildCsp({ nonce: "n", dev: true, reportUri: CSP_REPORT_PATH });
    expect(csp).not.toMatch(/\n|\s{2,}|^\s|\s$/);
  });
});

describe("cspHeaderName", () => {
  it("names the observing and the enforcing header", () => {
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });
});

describe("sentryTarget", () => {
  it("derives the ingest origin and the security endpoint from the DSN", () => {
    expect(sentryTarget("https://abc@o9.ingest.de.sentry.io/123")).toEqual({
      origin: "https://o9.ingest.de.sentry.io",
      reportUri: "https://o9.ingest.de.sentry.io/api/123/security/?sentry_key=abc",
    });
  });

  it("keeps the path of a self-hosted Sentry", () => {
    expect(sentryTarget("https://abc@sentry.example/base/7")?.reportUri).toBe("https://sentry.example/base/api/7/security/?sentry_key=abc");
  });

  it("gives up on a missing or malformed DSN", () => {
    for (const dsn of [undefined, null, "", "not a url", "http://abc@host/1", "https://host/1", "https://abc@host/x"]) {
      expect(sentryTarget(dsn)).toBeNull();
    }
  });
});

describe("generateNonce", () => {
  it("is base64 of 16 random bytes and changes every time", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(a);
  });
});

describe("parseCspReports", () => {
  it("reads the report-uri format and keeps only origin and path", () => {
    const [v] = parseCspReports({
      "csp-report": {
        "document-uri": "https://app.example/ordine?token=secret#x",
        "violated-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?k=1",
      },
    });
    expect(v).toEqual({ directive: "script-src-elem", blocked: "https://evil.example", page: "/ordine" });
  });

  it("reads the Reporting API format and ignores other report types", () => {
    const out = parseCspReports([
      { type: "deprecation", body: { message: "x" } },
      { type: "csp-violation", body: { documentURL: "https://app.example/", effectiveDirective: "style-src-attr", blockedURL: "inline" } },
    ]);
    expect(out).toEqual([{ directive: "style-src-attr", blocked: "inline", page: "/" }]);
  });

  it("reads at most 20 entries of a list", () => {
    const entry = { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "data", documentURL: "https://a.example/" } };
    expect(parseCspReports(Array.from({ length: 50 }, () => entry))).toHaveLength(20);
  });

  it("returns nothing for anything else", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports({ foo: 1 })).toEqual([]);
    expect(parseCspReports("x")).toEqual([]);
  });
});
