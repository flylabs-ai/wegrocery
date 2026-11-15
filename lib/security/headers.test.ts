import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { SECURITY_HEADERS } from "./headers";

describe("security headers", () => {
  const value = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

  it("sends them on every path", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(SECURITY_HEADERS);
  });

  it("keeps HTTPS for at least a year, without preload", () => {
    const hsts = value("Strict-Transport-Security")!;
    expect(Number(/max-age=(\d+)/.exec(hsts)![1])).toBeGreaterThanOrEqual(31536000);
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });

  it("refuses framing, type sniffing and full referrers", () => {
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("turns off the device features the app never asks for", () => {
    const policy = value("Permissions-Policy")!;
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("does not say which framework serves the app", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
