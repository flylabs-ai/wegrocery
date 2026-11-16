// The group's colours as theme tokens (FlyLabs Playbook 2.10). The engine is
// the FlyLabs Kit module `tema` 2.0 (lib/brand/tokens.ts, copied unchanged);
// this file keeps the names the app already uses, with the kit's default
// config, which holds WeGrocery's neutrals. lib/brand/tokens.test.ts pins
// the output byte for byte.
import {
  DEFAULT_TOKEN_CONFIG,
  brandContrastWarnings as tokenWarnings,
  brandToTokens,
  darkTokens,
  lightTokens,
  resolvePalette as resolveTokenPalette,
  tokensCss,
  type Palette,
} from "./tokens";
import type { BrandTheme } from "./types";

export type { Palette };

export const DEFAULT_PALETTE: Palette = DEFAULT_TOKEN_CONFIG.palette;

/** The dark theme's neutrals, the same for every group. */
export const DARK = DEFAULT_TOKEN_CONFIG.dark;

/**
 * The kit's config plus the text on the filled destructive button (FlyLabs Kit
 * ui 1.1), a role the app sets: the dark fill is a light red, so its text is
 * the dark card colour. The light value is in app/globals.css.
 */
const CONFIG = {
  ...DEFAULT_TOKEN_CONFIG,
  darkExtra: { ...DEFAULT_TOKEN_CONFIG.darkExtra, "--destructive-foreground": DARK.card },
};

export function resolvePalette(theme: BrandTheme): Palette {
  return resolveTokenPalette(theme);
}

/** CSS custom properties set on <html>; the only source of brand colours. */
export function deriveRoleVars(theme: BrandTheme): Record<string, string> {
  return lightTokens(theme);
}

/** The same variables for the dark theme, plus the neutrals globals.css holds for the light one. */
export function deriveDarkRoleVars(theme: BrandTheme): Record<string, string> {
  return darkTokens(theme, CONFIG);
}

/** The stylesheet that carries the brand's colours, light and dark. */
export function roleVarsCss(theme: BrandTheme): string {
  return tokensCss(brandToTokens(theme, CONFIG));
}

/** Human-readable problems with the brand palette; empty when it is fine. */
export function brandContrastWarnings(theme: BrandTheme): string[] {
  return tokenWarnings(theme);
}
