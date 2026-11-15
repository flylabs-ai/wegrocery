import { describe, expect, it } from "vitest";
import { PRIVATE_AREA_HEADERS, SECURITY_HEADERS, securityHeaderRules } from "./headers";

const value = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe("SECURITY_HEADERS", () => {
  it("keeps every connection on https for two years, without preload", () => {
    expect(value("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });

  it("denies framing and sniffing, and sends only the origin elsewhere", () => {
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("turns off the browser features the apps never use, payment included", () => {
    expect(value("Permissions-Policy")).toContain("payment=()");
    expect(value("Permissions-Policy")).toContain("camera=()");
  });

  it("leaves the CSP to the proxy", () => {
    expect(SECURITY_HEADERS.some((h) => h.key.startsWith("Content-Security-Policy"))).toBe(false);
  });
});

describe("securityHeaderRules", () => {
  it("applies the security set everywhere", () => {
    expect(securityHeaderRules()).toEqual([{ source: "/:path*", headers: [...SECURITY_HEADERS] }]);
  });

  it("adds the private set to each prefix and what is under it", () => {
    const rules = securityHeaderRules(["/staff/"]);
    expect(rules.slice(1)).toEqual([
      { source: "/staff", headers: [...PRIVATE_AREA_HEADERS] },
      { source: "/staff/:path*", headers: [...PRIVATE_AREA_HEADERS] },
    ]);
  });

  it("refuses a prefix that is not a plain path", () => {
    expect(() => securityHeaderRules(["staff"])).toThrow();
    expect(() => securityHeaderRules(["/a/:b*"])).toThrow();
  });
});
