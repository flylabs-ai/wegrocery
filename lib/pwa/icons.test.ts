import { describe, expect, it } from "vitest";
import { buildIcons, findIcon, localLogoPath, logoMimeType, fallbackInitial } from "./icons";
const paths = { icon192: "/icons/192.png", icon512: "/icons/512.png", maskable512: "/icons/maskable-512.png", apple180: "/icons/apple-180.png" };
describe("PWA icons", () => {
  it("keeps WeGrocery's sizes, purposes and safe logo scales with configured paths", () => {
    const icons = buildIcons(paths);
    expect(icons.manifest.map((i) => [i.sizes, i.purpose])).toEqual([["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]);
    expect(icons.appleTouch.sizes).toBe("180x180");
    expect(findIcon("maskable-512.png", icons.all)?.logoScale).toBeLessThanOrEqual(0.8 / Math.SQRT2);
    expect(findIcon("missing", icons.all)).toBeNull();
    expect(buildIcons({ ...paths, icon192: "/custom/small.png" }).manifest[0].src).toBe("/custom/small.png");
  });
  it("preserves the app's lookup for local logo filenames with a backslash", () => {
    const path = "/example\\logo.png";
    expect(localLogoPath(path)).toBe(path);
  });

  it("preserves local path, MIME and fallback helpers without fetching", () => {
    expect(localLogoPath("/logo.png?v=2")).toBe("/logo.png");
    for (const path of ["https://example.com/logo.png", "//example.com/logo.png", "/../private"]) expect(localLogoPath(path)).toBeNull();
    expect(logoMimeType("/brand/logo.SVG")).toBe("image/svg+xml");
    expect(logoMimeType("/logo")).toBe("image/png");
    expect(fallbackInitial("example")).toBe("E"); expect(fallbackInitial(" ")).toBe("?");
  });
});
