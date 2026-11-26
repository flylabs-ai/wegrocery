import type { Viewport } from "next";

export type AppViewportOptions = {
  chosenTheme: "light" | "dark" | "system";
  /** Pass statusBarColors(tokens) from tema 2.0. The cookie is read by the app. */
  statusBar: { light: string; dark: string };
};
export function appViewport({ chosenTheme, statusBar }: AppViewportOptions): Viewport {
  return {
    width: "device-width", initialScale: 1, viewportFit: "cover",
    themeColor: chosenTheme === "system" ? [
      { media: "(prefers-color-scheme: light)", color: statusBar.light },
      { media: "(prefers-color-scheme: dark)", color: statusBar.dark },
    ] : statusBar[chosenTheme],
    colorScheme: chosenTheme === "system" ? "light dark" : chosenTheme,
  };
}
