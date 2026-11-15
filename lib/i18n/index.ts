import { brand } from "@/lib/brand";
import type { Locale } from "@/lib/brand/types";
import { it, type Strings } from "./it";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { resolveLocale } from "./resolve";

const PACKS: Record<Locale, Strings> = { it, en, es, fr };

/** The languages of the app; the reference pack for the parity test is Italian. */
export const LOCALE_CONFIG = {
  supported: ["it", "en", "es", "fr"] as const satisfies readonly Locale[],
  defaultLocale: "it",
} as const;

// One language per installation: the group's brand.locale (FlyLabs Kit module
// i18n, "installation" mode). An unsupported value falls back to Italian.
export const t = PACKS[resolveLocale({ ...LOCALE_CONFIG, mode: "installation", brandLocale: brand.locale })];
export type { Strings } from "./it";
