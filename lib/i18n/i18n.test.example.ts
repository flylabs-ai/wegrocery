import { describe, expect, it } from "vitest";
import { compareParity } from "./parity";
import { findEmDashLines, findChangelogEmDashLines } from "./no-em-dash";
import { resolveLocale } from "./resolve";

export interface I18nTestConfig<Locale extends string> {
  supported: readonly Locale[];
  defaultLocale: NoInfer<Locale>;
  referenceLocale: NoInfer<Locale>;
  packs: Record<Locale, unknown>;
  sources: readonly { name: string; text: string }[];
  changelogs: readonly { name: string; text: string }[];
  /**
   * Key paths (without the locale prefix) whose {placeholders} are words the
   * user reads and types, so each language names them in its own words, e.g.
   * a bank reference template "{ordine} {mese}" / "{order} {month}". Only the
   * placeholder check is skipped there; each path must exist as a string.
   */
  localizedPlaceholders?: readonly string[];
}

function valueAt(pack: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (node, key) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
    pack,
  );
}

/** Copy unchanged, then call from an app-owned .test.ts with its packs and texts. */
export function defineI18nTests<const Locale extends string>(config: I18nTestConfig<Locale>): void {
  describe("app i18n", () => {
    for (const locale of config.supported) {
      it(`${locale}: matches the reference pack`, () => {
        const localized = new Set((config.localizedPlaceholders ?? []).map((path) => `${locale}.${path}`));
        const differences = compareParity(config.packs[config.referenceLocale], config.packs[locale], locale);
        expect(differences.filter((d) => !(d.kind === "placeholders" && localized.has(d.path)))).toEqual([]);
      });
      it(`${locale}: can be selected per request or per installation`, () => {
        expect(resolveLocale({ ...config, mode: "request", savedLocale: locale })).toBe(locale);
        expect(resolveLocale({ ...config, mode: "installation", brandLocale: locale })).toBe(locale);
      });
    }
    for (const path of config.localizedPlaceholders ?? []) {
      it(`${path}: is a text in every pack`, () => {
        for (const locale of config.supported) expect(typeof valueAt(config.packs[locale], path)).toBe("string");
      });
    }
    for (const source of config.sources) {
      it(`${source.name}: has no em dash`, () => {
        expect(findEmDashLines(source.name, source.text)).toEqual([]);
      });
    }
    for (const changelog of config.changelogs) {
      it(`${changelog.name}: headings and new entries have no em dash`, () => {
        expect(findChangelogEmDashLines(changelog.name, changelog.text)).toEqual([]);
      });
    }
  });
}
