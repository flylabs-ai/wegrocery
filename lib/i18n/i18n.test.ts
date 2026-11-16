import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { defineI18nTests } from "./i18n.test.example";
import { it } from "./it";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { LOCALE_CONFIG } from "./index";

// FlyLabs Playbook 3.1 and 3.4 with the kit's i18n module: the four packs
// match the Italian one (keys, types, {placeholders}, function arity), the
// packs are read as source so function strings are covered too, and the
// changelogs shown in the app have no em dash in headings or new entries
// (the bullets of past releases stay as they were published).
const folder = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

defineI18nTests({
  ...LOCALE_CONFIG,
  referenceLocale: "it",
  // The bank reference template: admins type its placeholders in their own
  // language (lib/payments/bank-reference.ts reads both spellings).
  localizedPlaceholders: [
    "admin.settings.bankReferenceHelp",
    "admin.settings.errors.referencePlaceholder",
    "topup.bankOrderReferenceDefault",
  ],
  packs: { it, en, es, fr },
  sources: LOCALE_CONFIG.supported.map((locale) => ({
    name: `${locale}.ts`,
    text: readFileSync(join(folder, `${locale}.ts`), "utf8"),
  })),
  changelogs: ["CHANGELOG.md", "CHANGELOG.it.md"].map((name) => ({
    name,
    text: readFileSync(join(root, name), "utf8"),
  })),
});
