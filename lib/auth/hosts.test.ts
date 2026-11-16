import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./hosts";

describe("safeCallbackPath", () => {
  it("keeps a local path and refuses anything else", () => {
    expect(safeCallbackPath("/ordine?cycleId=1")).toBe("/ordine?cycleId=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "ordine", "", null, undefined]) {
      expect(safeCallbackPath(bad)).toBe("/");
    }
  });
});
