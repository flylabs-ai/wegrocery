import { describe, expect, it } from "vitest";
import { appViewport } from "./viewport";
const statusBar = { light: "background-light", dark: "background-dark" };
describe("appViewport", () => {
  it.each(["light", "dark"] as const)("uses the chosen theme's background: %s", (chosenTheme) => {
    expect(appViewport({ chosenTheme, statusBar })).toMatchObject({ width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: statusBar[chosenTheme], colorScheme: chosenTheme });
  });
  it("offers both background colours to system theme and preserves zoom", () => {
    const viewport = appViewport({ chosenTheme: "system", statusBar });
    expect(viewport.themeColor).toEqual([{ media: "(prefers-color-scheme: light)", color: statusBar.light }, { media: "(prefers-color-scheme: dark)", color: statusBar.dark }]);
    expect(viewport.colorScheme).toBe("light dark"); expect(viewport.userScalable).not.toBe(false);
  });
});
