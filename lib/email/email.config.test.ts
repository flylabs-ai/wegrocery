import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, deriveRoleVars } from "@/lib/brand/roles";
import { t } from "@/lib/i18n";
import { APP_NAME, EMAIL_THEME, FLYLABS_URL, LOGO, emailColors, emailConfig } from "./email.config";
import { emailHtml } from "./layout";

// WeGrocery's settings for the kit's layout; the rendering itself is tested
// by the kit's layout.test.ts and layout.compatibility.test.ts.
const WEB = join(import.meta.dirname, "..", "..");

describe("EMAIL_THEME", () => {
  // The fixed colours live in app/globals.css, the brand roles in
  // lib/brand/roles.ts (computed per group).
  const css = readFileSync(join(WEB, "app", "globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"));
  const token = (name: string) => root.match(new RegExp(`--${name}:\\s*([^;]+);`, "i"))?.[1].trim();
  const roles = deriveRoleVars(DEFAULT_PALETTE);

  // An rgba() token drawn over an opaque background, as a mail client paints it.
  function over(rgba: string, background: string): string {
    const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number);
    const bg = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
    return `#${[r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
  }

  it("is the light theme of app/globals.css and the default brand palette", () => {
    expect(EMAIL_THEME).toEqual({
      background: roles["--background"],
      card: token("card"),
      foreground: token("foreground"),
      mutedForeground: roles["--muted-foreground"],
      primary: roles["--primary"],
      primaryForeground: roles["--primary-foreground"],
      primaryText: roles["--primary-text"],
      border: over(token("border")!, token("card")!),
    });
  });

  it("is what emailColors gives for the default palette", () => {
    expect(EMAIL_THEME).toMatchObject(emailColors({}));
  });

  it("serves the logo from a file that exists, at three times the size shown", () => {
    const png = readFileSync(join(WEB, "public", LOGO.url));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([LOGO.width * 3, LOGO.height * 3]);
  });
});

describe("emailConfig", () => {
  const BASE = "https://gas.example.org";

  it("links flylabs.ai in the emails' language, with no tracking", () => {
    expect(FLYLABS_URL).toMatch(/^https:\/\/www\.flylabs\.ai\/(it|en)(\/[a-z-]+)?$/);
  });

  it("keeps WeGrocery's name and colours on top when no group is given", () => {
    const html = emailHtml("Testo", emailConfig(), { subject: "O", baseUrl: BASE });
    expect(html).toContain(`>${APP_NAME}</span>`);
    expect(html).toContain(`border-top:4px solid ${EMAIL_THEME.primary}`);
    expect(html).toContain(`<img src="${BASE}/mail/logo.png"`);
  });

  it("names the buttons after the app's pages in the installation's language", () => {
    const html = emailHtml(`Apri nell'app: ${BASE}/ordine/4\n\n${BASE}/profilo/notifiche`, emailConfig(), { subject: "O", baseUrl: BASE });
    expect(html).toContain(`>${t.email.buttons.order}</a>`);
    expect(html).toContain(`>${t.email.buttons.preferences}</a>`);
  });
});
