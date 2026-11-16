import { describe, expect, it } from "vitest";
import { createAuthEndpointGuard, isPublicAuthEndpoint, PUBLIC_AUTH_ENDPOINTS } from "./public-endpoints";

const methods = { magicLink: true, emailOtp: true, google: false };
describe("public auth endpoints", () => {
  it("keeps the shared allowlist closed except for enabled methods", () => {
    expect(PUBLIC_AUTH_ENDPOINTS.GET).toEqual(["/api/auth/magic-link/verify"]);
    expect(isPublicAuthEndpoint("GET", "/api/auth/magic-link/verify", methods)).toBe(true);
    expect(isPublicAuthEndpoint("POST", "/api/auth/sign-in/magic-link", methods)).toBe(true);
    expect(isPublicAuthEndpoint("POST", "/api/auth/sign-in/email-otp", methods)).toBe(true);
    expect(isPublicAuthEndpoint("POST", "/api/auth/sign-in/social", methods)).toBe(false);
    expect(isPublicAuthEndpoint("GET", "/api/auth/callback/google", { ...methods, google: true })).toBe(true);
    expect(isPublicAuthEndpoint("POST", "/api/auth/sign-in/magic-link", { ...methods, magicLink: false })).toBe(false);
    for (const path of ["get-session", "revoke-sessions", "email-otp/send-verification-otp", "sign-up/email", "sign-in/magic-link/"]) {
      expect(isPublicAuthEndpoint("POST", `/api/auth/${path}`, methods)).toBe(false);
    }
    expect(isPublicAuthEndpoint("HEAD", "/api/auth/magic-link/verify", methods)).toBe(false);
  });
  it("accepts exact app-owned demo/e2e/dev extras without implicitly exposing them", () => {
    const extras = { POST: ["/api/auth/demo/sign-in", "/api/auth/e2e/sign-in", "/api/auth/dev/sign-in"] };
    expect(isPublicAuthEndpoint("POST", "/api/auth/demo/sign-in", methods)).toBe(false);
    expect(isPublicAuthEndpoint("POST", "/api/auth/demo/sign-in", methods, extras)).toBe(true);
    expect(isPublicAuthEndpoint("GET", "/api/auth/demo/sign-in", methods, extras)).toBe(false);
    expect(isPublicAuthEndpoint("POST", "/api/auth/demo/sign-in/extra", methods, extras)).toBe(false);
  });
  it("returns 404 before invoking Better Auth on a private endpoint", async () => {
    let calls = 0;
    const handler = createAuthEndpointGuard(() => { calls++; return new Response("ok"); }, methods);
    expect((await handler(new Request("https://app.example.com/api/auth/revoke-sessions", { method: "POST" }))).status).toBe(404);
    expect(calls).toBe(0);
    expect((await handler(new Request("https://app.example.com/api/auth/sign-in/magic-link", { method: "POST" }))).status).toBe(200);
    expect(calls).toBe(1);
  });
  it("rejects wildcard extras and attempts to bypass a disabled core method", () => {
    for (const path of ["/api/auth/*", "/api/auth/sign-in/social", "/other", "/api/auth/demo?token=example"]) {
      expect(() => createAuthEndpointGuard(() => new Response(), methods, { POST: [path] })).toThrow();
    }
  });
});
