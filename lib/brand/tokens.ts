// Brand colours to theme tokens (Playbook 2.2, 2.4, 2.10): a palette of six
// colours becomes the CSS custom properties of the light and the dark theme,
// with the contrast guaranteed by construction. Text tokens are darkened (on
// light) or lightened (on dark) in the same hue until they reach 4.5:1 on
// every surface they are used on; control borders and the focus ring reach
// 3:1; the text on a fill is the neutral foreground or white, whichever
// reads better. The brand's fills stay as given in the light theme and are
// lightened in the dark one only when they would vanish on a dark surface.
//
// The neutrals (surfaces, body text, status colours) are the app's own and
// do not change with the brand: they come in `TokenConfig`. The light
// neutrals stay in app/globals.css (only what depends on the brand is
// generated for the light theme); the dark theme is generated whole.
//
// Shape tokens (Playbook 2.6, decision 3b of the core plan): the radius of
// cards and of controls and the height of a control are tokens too, so a
// brand choice such as WeGrocery's pill buttons is configuration, not a
// change to the components.
//
// FlyLabs Kit registry module `tema` 2.0 (from WeGrocery, lib/brand/roles.ts).
// Copy it to lib/tokens.ts next to contrast.ts. Pure: no imports from the app.

import { contrastRatio, darkenToContrast, lightenToContrast, mixHex, parseHex, pickOn } from "./contrast";

export type Palette = {
  primary: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  background: string;
  /** The colour around the page on a wide screen. */
  frame: string;
};

export type BrandColors = Partial<Record<keyof Palette, string>>;

export type TokenConfig = {
  /** The palette used for any colour the brand does not give (or gives not as a hex). */
  palette: Palette;
  /** The light neutrals of app/globals.css the generated tokens are measured against. */
  light: {
    foreground: string;
    card: string;
    muted: string;
    dangerBg: string;
    /** The starting point of --muted-foreground, darkened if a surface needs it. */
    mutedForeground: string;
    /** The starting point of --input (control borders), darkened until 3:1. */
    input: string;
    /** A hex border for email, where rgba() borders are not safe. */
    emailBorder: string;
  };
  /** The dark theme's neutrals. */
  dark: {
    background: string;
    frame: string;
    card: string;
    foreground: string;
    muted: string;
    secondaryForeground: string;
    /** Fills and disabled states only. */
    neutral: string;
    destructive: string;
    dangerBg: string;
    warningBg: string;
    success: string;
    successBg: string;
    mutedForeground: string;
    input: string;
    border: string;
  };
  /** Extra dark tokens written as they are, such as the FlyLabs signature's colours. */
  darkExtra: Record<string, string>;
};

// WeGrocery's values (app/globals.css and lib/brand/roles.ts), the first app
// that generates its theme from a brand.
export const DEFAULT_TOKEN_CONFIG: TokenConfig = {
  palette: {
    primary: "#f5a623",
    primaryLight: "#fef3dc",
    accent: "#00a896",
    accentLight: "#e0f5f3",
    background: "#faf8f5",
    frame: "#ddd8d0",
  },
  light: {
    foreground: "#2d2b29",
    card: "#ffffff",
    muted: "#f3f2f0",
    dangerBg: "#feecec",
    mutedForeground: "#6b6b6b",
    input: "#8a8886",
    emailBorder: "#eeeeef",
  },
  dark: {
    background: "#161514",
    frame: "#0e0d0d",
    card: "#201e1c",
    foreground: "#f1eee9",
    muted: "#2b2927",
    secondaryForeground: "#b9b6b0",
    neutral: "#6a6762",
    destructive: "#ff9a9a",
    dangerBg: "#3b1d1d",
    warningBg: "#3a2a17",
    success: "#7fd18b",
    successBg: "#1b3221",
    mutedForeground: "#a29f99",
    input: "#7a7772",
    border: "rgba(255, 255, 255, 0.14)",
  },
  // The flylabs.ai logo's dark colours (Playbook 2.11, module firma): the
  // same for every brand, like the light pair in globals.css.
  darkExtra: { "--flylabs-ai": "#7a80ff", "--flylabs-spark": "#ffda47" },
};

const AA = 4.5; // text (WCAG 1.4.3)
const NON_TEXT = 3; // control borders, the focus ring, icons, fills (WCAG 1.4.11)
const TINT = 0.2; // the strongest tint of a fill used behind its own text (bg-primary/20)
const DARK_TINT_SOFT = 0.16; // how much of its colour a dark soft fill takes

export type ThemeTokenSet = Record<string, string>;
export type BrandTokens = { light: ThemeTokenSet; dark: ThemeTokenSet };

/** The brand's colours over the defaults; a colour that is not a hex keeps the default. */
export function resolvePalette(brand: BrandColors, config: TokenConfig = DEFAULT_TOKEN_CONFIG): Palette {
  const out = { ...config.palette };
  for (const k of Object.keys(out) as (keyof Palette)[]) {
    const v = brand[k];
    if (v && parseHex(v)) out[k] = v;
  }
  return out;
}

/** Every light surface a coloured text token is used on, named for the warnings. */
function textSurfaces(p: Palette, role: "primary" | "accent", config: TokenConfig): [string, string][] {
  const soft = role === "primary" ? "primaryLight" : "accentLight";
  return [
    ["background", p.background],
    [soft, p[soft]],
    ["cards", config.light.card],
    [`${role} tint on background`, mixHex(p[role], p.background, TINT)],
    [`${role} tint on cards`, mixHex(p[role], config.light.card, TINT)],
  ];
}

function mutedSurfaces(p: Palette, config: TokenConfig): [string, string][] {
  return [
    ["background", p.background],
    ["primaryLight", p.primaryLight],
    ["accentLight", p.accentLight],
    ["cards", config.light.card],
    ["muted fill", config.light.muted],
    ["danger background", config.light.dangerBg],
  ];
}

const colours = (surfaces: [string, string][]) => surfaces.map(([, c]) => c);

/** The light tokens that depend on the brand; the rest stays in app/globals.css. */
export function lightTokens(brand: BrandColors, config: TokenConfig = DEFAULT_TOKEN_CONFIG): ThemeTokenSet {
  const p = resolvePalette(brand, config);
  const primaryText = darkenToContrast(p.primary, colours(textSurfaces(p, "primary", config)), AA);
  return {
    "--primary": p.primary,
    "--primary-bg": p.primaryLight,
    "--primary-foreground": pickOn(p.primary, config.light.foreground),
    "--primary-text": primaryText,
    "--ring": primaryText,
    "--accent": p.accent,
    "--accent-bg": p.accentLight,
    "--accent-foreground": pickOn(p.accent, config.light.foreground),
    "--accent-text": darkenToContrast(p.accent, colours(textSurfaces(p, "accent", config)), AA),
    "--muted-foreground": darkenToContrast(config.light.mutedForeground, colours(mutedSurfaces(p, config)), AA),
    "--input": darkenToContrast(config.light.input, [p.background, config.light.card], NON_TEXT),
    "--background": p.background,
    "--frame": p.frame,
  };
}

/** The whole dark theme: the brand's colours made readable on the app's dark neutrals. */
export function darkTokens(brand: BrandColors, config: TokenConfig = DEFAULT_TOKEN_CONFIG): ThemeTokenSet {
  const p = resolvePalette(brand, config);
  const d = config.dark;
  const surfaces = [d.background, d.card];
  const primary = lightenToContrast(p.primary, surfaces, NON_TEXT);
  const accent = lightenToContrast(p.accent, surfaces, NON_TEXT);
  const primaryBg = mixHex(primary, d.card, DARK_TINT_SOFT);
  const accentBg = mixHex(accent, d.card, DARK_TINT_SOFT);
  const textOn = (fill: string, soft: string) => [...surfaces, soft, mixHex(fill, d.background, TINT), mixHex(fill, d.card, TINT)];
  const primaryText = lightenToContrast(primary, textOn(primary, primaryBg), AA);
  return {
    "--primary": primary,
    "--primary-bg": primaryBg,
    "--primary-foreground": pickOn(primary, d.card),
    "--primary-text": primaryText,
    "--ring": primaryText,
    "--accent": accent,
    "--accent-bg": accentBg,
    "--accent-foreground": pickOn(accent, d.card),
    "--accent-text": lightenToContrast(accent, textOn(accent, accentBg), AA),
    "--muted-foreground": lightenToContrast(d.mutedForeground, [...surfaces, primaryBg, accentBg, d.muted, d.dangerBg], AA),
    "--input": lightenToContrast(d.input, surfaces, NON_TEXT),
    "--background": d.background,
    "--frame": d.frame,
    "--card": d.card,
    "--card-foreground": d.foreground,
    "--popover": d.card,
    "--popover-foreground": d.foreground,
    "--foreground": d.foreground,
    "--muted": d.muted,
    "--secondary": d.muted,
    "--secondary-foreground": d.secondaryForeground,
    "--neutral": d.neutral,
    "--border": d.border,
    "--destructive": d.destructive,
    "--danger-bg": d.dangerBg,
    "--warning-bg": d.warningBg,
    "--success": d.success,
    "--success-bg": d.successBg,
    "--inverse": d.foreground,
    "--inverse-foreground": d.card,
    "--tint": "#ffffff",
    ...config.darkExtra,
  };
}

/** A brand's two token sets. */
export function brandToTokens(brand: BrandColors, config: TokenConfig = DEFAULT_TOKEN_CONFIG): BrandTokens {
  return { light: lightTokens(brand, config), dark: darkTokens(brand, config) };
}

const SAFE_NAME = /^--[a-z][a-z0-9-]*$/;
const SAFE_VALUE = /^[#a-z0-9(),.% -]+$/i;

function block(vars: ThemeTokenSet): string {
  return Object.entries(vars)
    .filter(([k, v]) => SAFE_NAME.test(k) && SAFE_VALUE.test(v))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/**
 * The stylesheet of a brand: light on :root, dark on :root[data-theme="dark"]
 * and, with no choice made, when the device is dark. Only token names and
 * values of a safe shape are written, so a brand cannot inject CSS.
 */
export function tokensCss(tokens: BrandTokens): string {
  const dark = `color-scheme:dark;${block(tokens.dark)}`;
  return (
    `:root{${block(tokens.light)}}` +
    `:root[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`
  );
}

/** Human-readable problems with a brand palette; empty when it is fine. */
export function brandContrastWarnings(brand: BrandColors, config: TokenConfig = DEFAULT_TOKEN_CONFIG): string[] {
  const warnings: string[] = [];
  for (const k of Object.keys(config.palette) as (keyof Palette)[]) {
    const v = brand[k];
    if (v && !parseHex(v)) warnings.push(`theme.${k} "${v}" is not a hex colour (#rgb or #rrggbb): using the default`);
  }
  const v = lightTokens(brand, config);
  for (const role of ["primary", "accent"] as const) {
    const ratio = contrastRatio(v[`--${role}-foreground`], v[`--${role}`]);
    if (ratio < AA) warnings.push(`${role} ${v[`--${role}`]}: text on it reaches only ${ratio.toFixed(2)}:1 (needs ${AA}:1)`);
  }
  // Text tokens can only be darkened, so a dark or saturated surface defeats them.
  const p = resolvePalette(brand, config);
  const checks: [string, [string, string][]][] = [
    ["--primary-text", textSurfaces(p, "primary", config)],
    ["--accent-text", textSurfaces(p, "accent", config)],
    ["--muted-foreground", mutedSurfaces(p, config)],
  ];
  for (const [token, surfaces] of checks) {
    for (const [name, colour] of surfaces) {
      const ratio = contrastRatio(v[token], colour);
      if (ratio < AA) warnings.push(`${name} ${colour}: ${token.slice(2)} reaches only ${ratio.toFixed(2)}:1 (needs ${AA}:1)`);
    }
  }
  const bg = contrastRatio(config.light.foreground, v["--background"]);
  if (bg < AA) warnings.push(`background ${v["--background"]}: body text reaches only ${bg.toFixed(2)}:1`);
  return warnings;
}

export type EmailTheme = {
  background: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  primaryText: string;
  border: string;
};

/**
 * The EMAIL_THEME of module email 2.0 from the light tokens: a mail client
 * reads no stylesheet, so the values are hex colours, and email is always
 * light.
 */
export function emailTheme(tokens: BrandTokens, config: TokenConfig = DEFAULT_TOKEN_CONFIG): EmailTheme {
  const l = tokens.light;
  return {
    background: l["--background"],
    card: config.light.card,
    foreground: config.light.foreground,
    mutedForeground: l["--muted-foreground"],
    primary: l["--primary"],
    primaryForeground: l["--primary-foreground"],
    primaryText: l["--primary-text"],
    border: config.light.emailBorder,
  };
}

/**
 * The phone's status bar in each theme (decision 3c of the core plan): the
 * page's background, never the brand's primary, so the system's icons stay
 * readable with any brand. Pass it to themeViewport.
 */
export function statusBarColors(tokens: BrandTokens): { light: string; dark: string } {
  return { light: tokens.light["--background"], dark: tokens.dark["--background"] };
}

export type ShapeTokens = {
  /** Cards and sheets (--radius). */
  radius: string;
  /** Buttons, inputs, chips (--control-radius); "9999px" for pills. */
  controlRadius: string;
  /** A compact control with a mouse (--control-h). */
  controlHeight: string;
  /** The same control on a touch screen: at least 44px (Playbook 2.6). */
  controlHeightTouch: string;
};

export const DEFAULT_SHAPE: ShapeTokens = {
  radius: "8px",
  controlRadius: "8px",
  controlHeight: "40px",
  controlHeightTouch: "44px",
};

const LENGTH = /^\d+(\.\d+)?(px|rem)$/;

/** The shape tokens as CSS; a value that is not a plain length keeps the default. */
export function shapeCss(shape: Partial<ShapeTokens> = {}): string {
  const s = { ...DEFAULT_SHAPE };
  for (const k of Object.keys(s) as (keyof ShapeTokens)[]) {
    const v = shape[k];
    if (v && LENGTH.test(v)) s[k] = v;
  }
  // A touch target under 44px would fail Playbook 2.6 (WCAG 2.5.8 asks 24px, Apple 44pt).
  if (s.controlHeightTouch.endsWith("px") && parseFloat(s.controlHeightTouch) < 44) s.controlHeightTouch = DEFAULT_SHAPE.controlHeightTouch;
  return (
    `:root{--radius:${s.radius};--control-radius:${s.controlRadius};--control-h:${s.controlHeight}}` +
    `@media (pointer:coarse){:root{--control-h:${s.controlHeightTouch}}}`
  );
}
