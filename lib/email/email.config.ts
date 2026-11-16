// WeGrocery's settings for FlyLabs Kit `email` 2.0 (lib/email/layout.ts,
// send.ts): the app's name, logo and light theme, the button labels in the
// installation's language and, per message, the group's identity (resend.ts
// reads it from getBrand). The layout itself is the kit's.

import { brand } from "@/lib/brand";
import { flylabsProductUrl } from "@/lib/brand/flylabs";
import { deriveRoleVars } from "@/lib/brand/roles";
import type { BrandTheme } from "@/lib/brand/types";
import { t } from "@/lib/i18n";
import type { EmailColors, EmailConfig, EmailIdentity } from "./layout";
import type { OutboundEnv } from "./outbound-policy";

export const APP_NAME = "WeGrocery";

// WeGrocery's light theme: a mail client reads no stylesheet and no CSS
// variables, so the values are copied here. The token names are the
// Playbook 2.2 ones; the brand roles (background, primary-text,
// muted-foreground) come from lib/brand/roles.ts for the default WeGrocery
// palette, since app/layout.tsx sets them per group. border is --border (a
// translucent grey) over the card. lib/email/email.config.test.ts checks they match.
export const EMAIL_THEME = {
  background: "#faf8f5",
  card: "#ffffff",
  foreground: "#2d2b29",
  mutedForeground: "#6b6b6b",
  primary: "#f5a623",
  primaryForeground: "#2d2b29",
  primaryText: "#8e6014",
  border: "#eeeeef",
} as const;

/** The group's light colours, from the same roles the app uses (lib/brand/roles.ts). */
export function emailColors(theme: BrandTheme): EmailColors {
  const v = deriveRoleVars(theme);
  return {
    background: v["--background"],
    mutedForeground: v["--muted-foreground"],
    primary: v["--primary"],
    primaryForeground: v["--primary-foreground"],
    primaryText: v["--primary-text"],
  };
}

// The product page on flylabs.ai in the emails' language, no tracking; the
// home while WeGrocery has none (lib/brand/flylabs.ts).
export const FLYLABS_URL = flylabsProductUrl(brand.locale);
// Served from public/mail/, which proxy.ts must leave open: a mail client
// fetches it with no session. A horizontal PNG (SVG does not show in Gmail or
// Outlook) at three times the size shown, for sharp high-DPI screens.
export const LOGO = { url: "/mail/logo.png", width: 164, height: 40 } as const;

export const PREFERENCES_PATH = "/profilo/notifiche";

/** The kit's configuration for one message: the group's identity, or WeGrocery's own look without one. */
export function emailConfig(identity: EmailIdentity | null = null): EmailConfig {
  const b = t.email.buttons;
  return {
    appName: APP_NAME,
    logo: LOGO,
    flylabsUrl: FLYLABS_URL,
    theme: EMAIL_THEME,
    identity: identity ?? { name: APP_NAME, logoUrl: null, showName: true, colors: EMAIL_THEME },
    textMode: "rich",
    preferencesPath: PREFERENCES_PATH,
    buttonText: { app: b.app, link: b.link, preferences: b.preferences },
    pageLabels: [
      ["/login", b.signIn],
      ["/ordine", b.order],
      ["/storico", b.history],
      ["/ricarica", b.topUp],
      ["/famiglia", b.family],
      ["/calendario", b.calendar],
      ["/notifiche", b.notifications],
      ["/profilo", b.profile],
      ["/admin", b.admin],
    ],
  };
}

export function outboundEnvFromProcess(): OutboundEnv {
  return { vercelEnv: process.env.VERCEL_ENV, redirectTo: process.env.EMAIL_REDIRECT_TO };
}
