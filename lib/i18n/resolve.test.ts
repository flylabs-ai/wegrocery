import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolve";

const supported = ["it", "en", "es", "fr"] as const;
const config = { supported, defaultLocale: "it" as const };

describe("resolveLocale", () => {
  it("prefers a supported saved language to the request header", () => {
    expect(resolveLocale({ ...config, mode: "request", savedLocale: "fr", acceptLanguage: "en" })).toBe("fr");
  });

  it("falls back from an unsupported saved language to Accept-Language weights", () => {
    expect(resolveLocale({ ...config, mode: "request", savedLocale: "de", acceptLanguage: "es;q=0.4,fr;q=0.9,en;q=0.8" })).toBe("fr");
  });

  it("matches regional tags without regard to case and keeps header order for equal weights", () => {
    expect(resolveLocale({ ...config, mode: "request", acceptLanguage: "EN-gb,fr;q=0.8" })).toBe("en");
    expect(resolveLocale({ ...config, mode: "request", acceptLanguage: "fr;q=0.8,es;q=0.8" })).toBe("fr");
  });

  it("ignores zero or malformed weights and unsupported languages", () => {
    expect(resolveLocale({ ...config, mode: "request", acceptLanguage: "fr;q=0,es;q=NaN,it;q=2,de;q=1,en;q=0.4" })).toBe("en");
  });

  it("falls back to the configured default, including wildcard-only headers", () => {
    for (const acceptLanguage of [undefined, "", "de", "*"]) {
      expect(resolveLocale({ ...config, mode: "request", acceptLanguage })).toBe("it");
    }
  });

  it("installation mode uses only brand.locale, never a person's request preferences", () => {
    const options = { ...config, mode: "installation" as const, brandLocale: "es", savedLocale: "en", acceptLanguage: "fr" };
    expect(resolveLocale(options)).toBe("es");
    expect(resolveLocale({ ...config, mode: "installation", brandLocale: "de" })).toBe("it");
  });

  it("works with a different supported set and prefers an exact regional match", () => {
    expect(resolveLocale({ supported: ["pt", "pt-BR"] as const, defaultLocale: "pt", mode: "request", acceptLanguage: "pt-BR,pt;q=0.8" })).toBe("pt-BR");
  });

  it("skips wildcard ranges during lookup and strips private-use extensions", () => {
    expect(resolveLocale({ ...config, mode: "request", acceptLanguage: "*;q=1,fr;q=0.7" })).toBe("fr");
    expect(resolveLocale({ ...config, mode: "request", acceptLanguage: "en-US-x-private" })).toBe("en");
  });

  it("rejects configuration that cannot return a supported default", () => {
    const empty: readonly string[] = [];
    expect(() => resolveLocale({ supported: empty, defaultLocale: "it", mode: "request" })).toThrow(/supported/);
    const options = { supported: ["en"], defaultLocale: "it", mode: "request" as const };
    expect(() => resolveLocale(options)).toThrow(/defaultLocale/);
  });
});
