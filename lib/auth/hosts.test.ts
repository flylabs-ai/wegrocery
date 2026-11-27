import { describe, expect, it } from "vitest";
import { nextAfterLogin, safeInternalPath } from "./hosts";

describe("safeInternalPath", () => {
  it("keeps a local path with its query", () => {
    expect(safeInternalPath("/ordine?cycleId=1")).toBe("/ordine?cycleId=1");
    expect(safeInternalPath("/")).toBe("/");
    expect(safeInternalPath("/notifiche#top")).toBe("/notifiche#top");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\\\\evil",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r//evil.example",
      "/\u0000/evil",
      "/\u007f/evil",
      "%2F%2Fevil",
      "ordine",
      "",
      null,
      undefined,
      42,
      ["/ordine"],
    ]) {
      expect(safeInternalPath(bad)).toBe("/");
    }
  });

  it("keeps an encoded slash inside a path, which stays on this origin", () => {
    expect(safeInternalPath("/%2F%2Fevil")).toBe("/%2F%2Fevil");
  });
});

describe("nextAfterLogin", () => {
  it("never sends back to the login page", () => {
    expect(nextAfterLogin("/login")).toBe("/");
    expect(nextAfterLogin("/login?error=LinkInvalid")).toBe("/");
    expect(nextAfterLogin("/login/conferma")).toBe("/");
    expect(nextAfterLogin("/loginx")).toBe("/loginx");
    expect(nextAfterLogin("/ordine?cycleId=X")).toBe("/ordine?cycleId=X");
    expect(nextAfterLogin("/\t/evil.example")).toBe("/");
  });
});
