import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce, parseCspReports } from "./csp";

describe("buildCsp", () => {
  const csp = buildCsp("abc123==");
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

  it("trusts scripts only through the nonce", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });

  it("refuses framing, plugins and a foreign base", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
  });

  it("lets forms leave only for Stripe Checkout and Google sign-in", () => {
    expect(directive("form-action")).toBe("form-action 'self' https://checkout.stripe.com https://accounts.google.com");
  });

  it("reports to the app's own endpoint", () => {
    expect(directive("report-uri")).toBe("report-uri /api/csp-report");
    expect(directive("report-to")).toBeUndefined();
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

  it("returns nothing for anything else", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports({ foo: 1 })).toEqual([]);
    expect(parseCspReports("x")).toEqual([]);
  });
});
