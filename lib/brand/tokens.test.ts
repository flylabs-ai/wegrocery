import { describe, expect, it } from "vitest";
import { contrastRatio, mixHex } from "./contrast";
import {
  DEFAULT_SHAPE,
  DEFAULT_TOKEN_CONFIG,
  brandContrastWarnings,
  brandToTokens,
  darkTokens,
  emailTheme,
  lightTokens,
  resolvePalette,
  shapeCss,
  statusBarColors,
  tokensCss,
  type BrandColors,
} from "./tokens";

const PALETTES: BrandColors[] = [
  {},
  { primary: "#1d4ed8", accent: "#7c3aed", primaryLight: "#dbeafe", accentLight: "#ede9fe", background: "#ffffff" },
  { primary: "#ffe14d", accent: "#2f9e44", background: "#f4f1ea" },
  { primary: "#111111", accent: "#e11d48" },
];

describe("brandToTokens: contrast by construction", () => {
  it.each(PALETTES)("light text tokens reach 4.5:1 on every surface they sit on (%o)", (brand) => {
    const v = lightTokens(brand);
    const card = DEFAULT_TOKEN_CONFIG.light.card;
    for (const role of ["primary", "accent"] as const) {
      for (const bg of [v["--background"], v[`--${role}-bg`], card, mixHex(v[`--${role}`], v["--background"], 0.2), mixHex(v[`--${role}`], card, 0.2)]) {
        expect(contrastRatio(v[`--${role}-text`], bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const bg of [v["--background"], v["--primary-bg"], v["--accent-bg"], card, DEFAULT_TOKEN_CONFIG.light.muted]) {
      expect(contrastRatio(v["--muted-foreground"], bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of [v["--background"], card]) expect(contrastRatio(v["--input"], bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(PALETTES)("dark tokens: fills visible, text readable, borders at 3:1 (%o)", (brand) => {
    const v = darkTokens(brand);
    for (const surface of [v["--background"], v["--card"]]) {
      expect(contrastRatio(v["--primary"], surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v["--accent"], surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v["--input"], surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v["--ring"], surface)).toBeGreaterThanOrEqual(3);
      for (const text of ["--foreground", "--primary-text", "--accent-text", "--muted-foreground"]) {
        expect(contrastRatio(v[text], surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrastRatio(v["--primary-text"], v["--primary-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--accent-text"], v["--accent-bg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the brand fills as given in the light theme and picks the text on them", () => {
    const v = lightTokens({ primary: "#1d4ed8" });
    expect(v["--primary"]).toBe("#1d4ed8");
    expect(v["--primary-foreground"]).toBe("#ffffff");
    expect(v["--ring"]).toBe(v["--primary-text"]);
  });

  it("falls back to the default for a colour that is not a hex, and says so", () => {
    expect(resolvePalette({ primary: "rgb(1,2,3)" }).primary).toBe(DEFAULT_TOKEN_CONFIG.palette.primary);
    expect(brandContrastWarnings({ primary: "rgb(1,2,3)" })).toEqual([expect.stringContaining("theme.primary")]);
    expect(brandContrastWarnings({})).toEqual([]);
  });

  it("warns when a fill cannot carry readable text or the page is too dark", () => {
    expect(brandContrastWarnings({ primary: "#1d8fe0" })).toEqual([expect.stringContaining("primary")]);
    expect(brandContrastWarnings({ background: "#111111" }).length).toBeGreaterThan(1);
  });

  it("takes the app's own neutrals from the config", () => {
    const config = { ...DEFAULT_TOKEN_CONFIG, dark: { ...DEFAULT_TOKEN_CONFIG.dark, background: "#000000" } };
    expect(darkTokens({}, config)["--background"]).toBe("#000000");
  });
});

describe("tokensCss", () => {
  it("writes light, forced dark and the device's dark, and nothing unsafe", () => {
    const css = tokensCss({ light: { "--primary": "#123456", "--x": "red;}body{display:none" }, dark: { "--primary": "#abcdef", "bad name": "#000" } });
    expect(css).toBe(
      ':root{--primary:#123456}:root[data-theme="dark"]{color-scheme:dark;--primary:#abcdef}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--primary:#abcdef}}',
    );
  });
});

describe("emailTheme and statusBarColors", () => {
  it("are the light tokens for email and the two page backgrounds for the status bar", () => {
    const tokens = brandToTokens({ primary: "#1d4ed8", background: "#ffffff" });
    expect(emailTheme(tokens)).toEqual({
      background: "#ffffff",
      card: "#ffffff",
      foreground: "#2d2b29",
      mutedForeground: tokens.light["--muted-foreground"],
      primary: "#1d4ed8",
      primaryForeground: "#ffffff",
      primaryText: tokens.light["--primary-text"],
      border: "#eeeeef",
    });
    expect(statusBarColors(tokens)).toEqual({ light: "#ffffff", dark: DEFAULT_TOKEN_CONFIG.dark.background });
  });
});

describe("shapeCss", () => {
  it("defaults to 8px corners and 40/44px controls", () => {
    expect(DEFAULT_SHAPE.radius).toBe("8px");
    expect(shapeCss()).toBe(":root{--radius:8px;--control-radius:8px;--control-h:40px}@media (pointer:coarse){:root{--control-h:44px}}");
  });

  it("takes a brand's pill, refuses anything but a length and a touch height under 44px", () => {
    expect(shapeCss({ controlRadius: "9999px", radius: "18px" })).toContain("--radius:18px;--control-radius:9999px");
    expect(shapeCss({ radius: "8px;}body{x:y" })).toContain("--radius:8px;");
    expect(shapeCss({ controlHeightTouch: "36px" })).toContain("--control-h:44px");
  });
});

// The output of WeGrocery's lib/brand/roles.ts (roleVarsCss, brandContrastWarnings)
// and lib/email/layout.ts (emailColors) on 2026-11-16, with the default config:
// adopting the module must change nothing on the page or in the emails.
const WEGROCERY = [
  {
    "brand": {},
    "css": ":root{--primary:#f5a623;--primary-bg:#fef3dc;--primary-foreground:#2d2b29;--primary-text:#8e6014;--ring:#8e6014;--accent:#00a896;--accent-bg:#e0f5f3;--accent-foreground:#2d2b29;--accent-text:#006f63;--muted-foreground:#6b6b6b;--input:#8a8886;--background:#faf8f5;--frame:#ddd8d0}:root[data-theme=\"dark\"]{color-scheme:dark;--primary:#f5a623;--primary-bg:#42341d;--primary-foreground:#201e1c;--primary-text:#f5a623;--ring:#f5a623;--accent:#00a896;--accent-bg:#1b3430;--accent-foreground:#201e1c;--accent-text:#14af9e;--muted-foreground:#a29f99;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){color-scheme:dark;--primary:#f5a623;--primary-bg:#42341d;--primary-foreground:#201e1c;--primary-text:#f5a623;--ring:#f5a623;--accent:#00a896;--accent-bg:#1b3430;--accent-foreground:#201e1c;--accent-text:#14af9e;--muted-foreground:#a29f99;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}}",
    "warnings": [],
    "email": {
      "background": "#faf8f5",
      "mutedForeground": "#6b6b6b",
      "primary": "#f5a623",
      "primaryForeground": "#2d2b29",
      "primaryText": "#8e6014"
    }
  },
  {
    "brand": {
      "primary": "#1d4ed8",
      "accent": "#7c3aed",
      "primaryLight": "#dbeafe",
      "accentLight": "#ede9fe",
      "background": "#ffffff",
      "frame": "#cbd5e1"
    },
    "css": ":root{--primary:#1d4ed8;--primary-bg:#dbeafe;--primary-foreground:#ffffff;--primary-text:#1d4ed8;--ring:#1d4ed8;--accent:#7c3aed;--accent-bg:#ede9fe;--accent-foreground:#ffffff;--accent-text:#7537df;--muted-foreground:#676767;--input:#8a8886;--background:#ffffff;--frame:#cbd5e1}:root[data-theme=\"dark\"]{color-scheme:dark;--primary:#3460dc;--primary-bg:#23293b;--primary-foreground:#ffffff;--primary-text:#7190e7;--ring:#7190e7;--accent:#7f3eed;--accent-bg:#2f233d;--accent-foreground:#ffffff;--accent-text:#a87cf3;--muted-foreground:#a29f99;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){color-scheme:dark;--primary:#3460dc;--primary-bg:#23293b;--primary-foreground:#ffffff;--primary-text:#7190e7;--ring:#7190e7;--accent:#7f3eed;--accent-bg:#2f233d;--accent-foreground:#ffffff;--accent-text:#a87cf3;--muted-foreground:#a29f99;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}}",
    "warnings": [],
    "email": {
      "background": "#ffffff",
      "mutedForeground": "#676767",
      "primary": "#1d4ed8",
      "primaryForeground": "#ffffff",
      "primaryText": "#1d4ed8"
    }
  },
  {
    "brand": {
      "primary": "#ffe14d",
      "accent": "#2f9e44",
      "background": "#f4f1ea"
    },
    "css": ":root{--primary:#ffe14d;--primary-bg:#fef3dc;--primary-foreground:#2d2b29;--primary-text:#7a6c25;--ring:#7a6c25;--accent:#2f9e44;--accent-bg:#e0f5f3;--accent-foreground:#2d2b29;--accent-text:#206b2e;--muted-foreground:#6b6b6b;--input:#8a8886;--background:#f4f1ea;--frame:#ddd8d0}:root[data-theme=\"dark\"]{color-scheme:dark;--primary:#ffe14d;--primary-bg:#443d24;--primary-foreground:#201e1c;--primary-text:#ffe14d;--ring:#ffe14d;--accent:#2f9e44;--accent-bg:#223222;--accent-foreground:#201e1c;--accent-text:#50ae62;--muted-foreground:#a9a7a1;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){color-scheme:dark;--primary:#ffe14d;--primary-bg:#443d24;--primary-foreground:#201e1c;--primary-text:#ffe14d;--ring:#ffe14d;--accent:#2f9e44;--accent-bg:#223222;--accent-foreground:#201e1c;--accent-text:#50ae62;--muted-foreground:#a9a7a1;--input:#7a7772;--background:#161514;--frame:#0e0d0d;--card:#201e1c;--card-foreground:#f1eee9;--popover:#201e1c;--popover-foreground:#f1eee9;--foreground:#f1eee9;--muted:#2b2927;--secondary:#2b2927;--secondary-foreground:#b9b6b0;--neutral:#6a6762;--border:rgba(255, 255, 255, 0.14);--destructive:#ff9a9a;--danger-bg:#3b1d1d;--warning-bg:#3a2a17;--success:#7fd18b;--success-bg:#1b3221;--inverse:#f1eee9;--inverse-foreground:#201e1c;--tint:#ffffff;--flylabs-ai:#7a80ff;--flylabs-spark:#ffda47}}",
    "warnings": [
      "accent #2f9e44: text on it reaches only 4.09:1 (needs 4.5:1)"
    ],
    "email": {
      "background": "#f4f1ea",
      "mutedForeground": "#6b6b6b",
      "primary": "#ffe14d",
      "primaryForeground": "#2d2b29",
      "primaryText": "#7a6c25"
    }
  }
] as const;

describe("same output as WeGrocery's roles.ts", () => {
  it.each(WEGROCERY)("palette %#", (expected) => {
    const brand = expected.brand as BrandColors;
    const tokens = brandToTokens(brand);
    expect(tokensCss(tokens)).toBe(expected.css);
    expect(brandContrastWarnings(brand)).toEqual(expected.warnings);
    const email = emailTheme(tokens);
    expect({
      background: email.background,
      mutedForeground: email.mutedForeground,
      primary: email.primary,
      primaryForeground: email.primaryForeground,
      primaryText: email.primaryText,
    }).toEqual(expected.email);
  });
});
