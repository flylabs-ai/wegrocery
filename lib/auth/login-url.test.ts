import { describe, expect, it } from "vitest";
import { loginErrorUrl, loginPath } from "./login-url";

describe("loginErrorUrl", () => {
  it("keeps the destination next to the error", () => {
    expect(loginErrorUrl("LinkInvalid", "/ordine?cycleId=X")).toBe("/login?error=LinkInvalid&next=%2Fordine%3FcycleId%3DX");
  });

  it("leaves out the home and a missing error", () => {
    expect(loginErrorUrl("LinkInvalid", "/")).toBe("/login?error=LinkInvalid");
    expect(loginErrorUrl(null, "/")).toBe("/login");
    expect(loginErrorUrl(null, "/storico")).toBe("/login?next=%2Fstorico");
  });
});

describe("loginPath", () => {
  it("keeps a page of the app with its query", () => {
    expect(loginPath("/ordine?cycleId=X")).toBe("/login?next=%2Fordine%3FcycleId%3DX");
  });

  it("gives the bare login page for the home, the login page, unsafe or too long targets", () => {
    for (const target of ["/", "/login", "/login?error=x", "/\t/evil.example", "//evil", null, undefined, `/ordine?x=${"a".repeat(1100)}`]) {
      expect(loginPath(target)).toBe("/login");
    }
  });
});
