import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

// What the session proxy leaves open: a path it does not match never meets
// the redirect to /login.
describe("proxy matcher", () => {
  it("leaves the email logo open, for mail clients with no session (Playbook 7.7)", () => {
    expect(matches("/mail/logo.png")).toBe(false);
    expect(matches("/mailbox")).toBe(true);
  });

  it("leaves the public endpoints open and guards the pages", () => {
    for (const url of ["/api/health", "/api/instance-stats", "/api/cron/open-cycles", "/api/unsubscribe", "/api/csp-report", "/manifest.webmanifest"]) {
      expect(matches(url)).toBe(false);
    }
    for (const url of ["/", "/ordine", "/admin", "/changelog", "/api/health/x"]) {
      expect(matches(url)).toBe(true);
    }
  });
});

describe("proxy redirect", () => {
  it("lets /aderisci through without a session, and nothing under it", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    const open = proxy(new NextRequest("https://app.example/aderisci"));
    expect(open.headers.get("location")).toBeNull();
    const guarded = proxy(new NextRequest("https://app.example/aderisci/x"));
    expect(guarded.headers.get("location")).toBe("https://app.example/login");
  });

  it("sends the home without a session to /gruppo, other pages to /login", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    expect(proxy(new NextRequest("https://app.example/")).headers.get("location")).toBe("https://app.example/gruppo");
    expect(proxy(new NextRequest("https://app.example/gruppo")).headers.get("location")).toBeNull();
    expect(proxy(new NextRequest("https://app.example/ordine")).headers.get("location")).toBe("https://app.example/login");
  });
});

describe("proxy content security policy", () => {
  it("sends a report-only policy with a new nonce on each page, and the same one to Next.js", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    const a = proxy(new NextRequest("https://app.example/login"));
    const b = proxy(new NextRequest("https://app.example/login"));
    const csp = a.headers.get("content-security-policy-report-only");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}' 'strict-dynamic'/);
    expect(csp).not.toBe(b.headers.get("content-security-policy-report-only"));
    expect(a.headers.get("content-security-policy")).toBeNull();
    expect(csp).toContain("report-uri /api/csp-report");
    // NextResponse.next passes the overridden request headers on with this prefix.
    expect(a.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(csp);
  });
});
