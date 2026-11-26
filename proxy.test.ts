import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(guarded.headers.get("location")).toBe("https://app.example/login?next=%2Faderisci%2Fx");
  });

  it("sends the home without a session to /gruppo, other pages to /login", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    expect(proxy(new NextRequest("https://app.example/")).headers.get("location")).toBe("https://app.example/gruppo");
    expect(proxy(new NextRequest("https://app.example/gruppo")).headers.get("location")).toBeNull();
    expect(proxy(new NextRequest("https://app.example/ordine")).headers.get("location")).toBe("https://app.example/login?next=%2Fordine");
  });

  it("keeps where the member was going, only for a page asked with GET (WGR-06)", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    const location = (url: string, init?: { method: string }) => proxy(new NextRequest(url, init)).headers.get("location");
    expect(location("https://app.example/ordine?cycleId=X")).toBe("https://app.example/login?next=%2Fordine%3FcycleId%3DX");
    expect(location("https://app.example/ordine?cycleId=X", { method: "POST" })).toBe("https://app.example/login");
    expect(location("https://app.example/api/whatever")).toBe("https://app.example/login");
    // A doubled slash in the path is not a way out: the browser keeps it on this site.
    expect(new URL(location("https://app.example//evil.example") ?? "").origin).toBe("https://app.example");
  });

  it("passes the asked path to the page, overwriting the client's header", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    const response = proxy(
      new NextRequest("https://app.example/ordine?cycleId=X", {
        headers: { cookie: "wegrocery.session_token=x", "x-wegrocery-path": "//evil.example" },
      }),
    );
    expect(response.headers.get("x-middleware-request-x-wegrocery-path")).toBe("/ordine?cycleId=X");
  });
});

describe("proxy content security policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enforces the policy with a new nonce on each page, and passes the same one to Next.js", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    const a = proxy(new NextRequest("https://app.example/login"));
    const b = proxy(new NextRequest("https://app.example/login"));
    const csp = a.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}' 'strict-dynamic'/);
    expect(csp).not.toBe(b.headers.get("content-security-policy"));
    expect(a.headers.get("content-security-policy-report-only")).toBeNull();
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("form-action 'self' https://checkout.stripe.com https://accounts.google.com");
    expect(csp).toContain("frame-src 'none'");
    // NextResponse.next passes the overridden request headers on with this prefix.
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("lets the Vercel Toolbar frame in only on preview deploys", async () => {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(proxy(new NextRequest("https://app.example/login")).headers.get("content-security-policy")).toContain("frame-src https://vercel.live");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(proxy(new NextRequest("https://app.example/login")).headers.get("content-security-policy")).toContain("frame-src 'none'");
  });
});
