import { describe, expect, it } from "vitest";
import { cn } from "./cn";
describe("cn", () => {
  it("merges conditional utilities with caller overrides", () => expect(cn("px-3", false && "hidden", ["px-4"], { flex: true })).toBe("px-4 flex"));
  it("preserves both apps' named font sizes alongside text colours", () => {
    for (const size of ["label", "display", "title", "heading", "subheading", "body", "meta"]) expect(cn(`text-${size}`, "text-muted-foreground")).toBe(`text-${size} text-muted-foreground`);
    expect(cn("rounded-(--control-radius)", "rounded-full")).toBe("rounded-full");
  });
});
