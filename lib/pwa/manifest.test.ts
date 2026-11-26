import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest";
import { buildIcons } from "./icons";
const icons = buildIcons({ icon192: "/192.png", icon512: "/512.png", maskable512: "/maskable.png", apple180: "/apple.png" }).manifest;
describe("buildManifest", () => {
  it.each(["white-label", "saas"])("uses the light page background, never a brand primary: %s", (profile) => {
    const result = buildManifest({ name: "Example", shortName: "Example", description: "Synthetic app", startUrl: "/", lang: "it", themeColors: { light: "#fafafa", dark: "#101010" }, icons, ...(profile === "white-label" ? { id: "/", orientation: "portrait" as const } : {}) });
    expect(result.theme_color).toBe("#fafafa"); expect(result.background_color).toBe("#fafafa");
    expect(result).toMatchObject({ name: "Example", short_name: "Example", start_url: "/", scope: "/", display: "standalone", lang: "it", icons });
    expect(result.orientation).toBe(profile === "white-label" ? "portrait" : undefined);
  });
  it("copies icon objects rather than retaining mutable input arrays", () => {
    const result = buildManifest({ name: "Example", shortName: "Ex", description: "Synthetic", startUrl: "/", themeColors: { light: "background", dark: "dark background" }, icons, lang: "en" });
    expect(result.icons).not.toBe(icons);
  });
});
