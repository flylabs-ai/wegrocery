import { describe, expect, it } from "vitest";
import { allowedHosts, fallbackBaseURL, resolveAuthHosts } from "./hosts";

describe("resolveAuthHosts", () => {
  it("trusts both configured hosts after a Vercel team change, preferring APP_BASE_URL for links", () => {
    const result = resolveAuthHosts({ APP_BASE_URL: "https://group.example.com/", VERCEL_PROJECT_PRODUCTION_URL: "new-team.example.test", NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(result.trustedOrigins).toEqual(["https://group.example.com", "https://new-team.example.test"]);
    expect(result.baseURL).toEqual({ allowedHosts: ["group.example.com", "new-team.example.test"], fallback: "https://group.example.com", protocol: "https" });
    expect(allowedHosts({ APP_BASE_URL: "https://group.example.com", VERCEL_PROJECT_PRODUCTION_URL: "new-team.example.test" })).toEqual(["group.example.com", "new-team.example.test"]);
    expect(fallbackBaseURL({ APP_BASE_URL: "https://group.example.com", VERCEL_PROJECT_PRODUCTION_URL: "new-team.example.test" })).toBe("https://group.example.com");
  });
  it("uses the Vercel production URL as fallback without APP_BASE_URL", () => {
    expect(resolveAuthHosts({ VERCEL_PROJECT_PRODUCTION_URL: "project.example.test", NODE_ENV: "production" }).trustedOrigins).toEqual(["https://project.example.test"]);
    expect(fallbackBaseURL({ VERCEL_PROJECT_PRODUCTION_URL: "project.example.test" })).toBe("https://project.example.test");
  });
  it("supports explicit SaaS domains and exact preview hosts without wildcards", () => {
    const env = { APP_BASE_URL: "https://app.example.com", VERCEL_ENV: "preview", NODE_ENV: "production", VERCEL_URL: "preview.example.test", VERCEL_BRANCH_URL: "branch.example.test" };
    const result = resolveAuthHosts(env, { additionalOrigins: ["https://alias.example.test"] });
    expect(result.trustedOrigins).toEqual(["https://app.example.com", "https://alias.example.test", "https://preview.example.test", "https://branch.example.test"]);
    expect(resolveAuthHosts({ ...env, VERCEL_ENV: "production" }).trustedOrigins).toEqual(["https://app.example.com"]);
  });
  it("allows localhost only in development, never implicitly in test or production", () => {
    expect(resolveAuthHosts({ NODE_ENV: "development" }).trustedOrigins).toEqual(["http://localhost:3000"]);
    expect(() => resolveAuthHosts({ NODE_ENV: "test" })).toThrow();
    expect(() => resolveAuthHosts({ NODE_ENV: "production" })).toThrow();
    expect(() => resolveAuthHosts({ NODE_ENV: "production", APP_BASE_URL: "http://localhost:3000" })).toThrow();
  });
  it.each(["https://*.example.com", "https://user:synthetic@example.com", "https://app.example.com?token=private", "not a host", "https://app.example.com/path", "http://app.example.com"]) ("rejects ambiguous or unsafe origin %s", (value) => {
    expect(() => resolveAuthHosts({ APP_BASE_URL: value, NODE_ENV: "production" })).toThrow();
  });
});
