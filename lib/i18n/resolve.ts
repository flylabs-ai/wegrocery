type LocaleConfig<Locale extends string> = {
  supported: readonly Locale[];
  defaultLocale: NoInfer<Locale>;
};

export type ResolveLocaleOptions<Locale extends string> = LocaleConfig<Locale> & (
  | { mode: "request"; savedLocale?: string | null; acceptLanguage?: string | null }
  | { mode: "installation"; brandLocale?: string | null }
);

/** Exact, case-insensitive lookup, then progressively less specific tags. */
function lookup<Locale extends string>(value: string | null | undefined, supported: readonly Locale[]): Locale | undefined {
  if (!value) return undefined;
  let range = value.trim().toLowerCase();
  if (!/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/.test(range)) return undefined;
  while (range) {
    const match = supported.find((locale) => locale.toLowerCase() === range);
    if (match !== undefined) return match;
    const parts = range.split("-");
    parts.pop();
    // Remove a singleton together with its trailing extension/private-use subtag.
    if (parts.at(-1)?.length === 1) parts.pop();
    range = parts.join("-");
  }
  return undefined;
}

/** No framework, session, environment or pack imports: the app provides inputs. */
export function resolveLocale<const Locale extends string>(options: ResolveLocaleOptions<Locale>): Locale {
  const { supported, defaultLocale } = options;
  if (supported.length === 0) throw new Error("At least one supported locale is required");
  if (!supported.includes(defaultLocale)) throw new Error("defaultLocale must be in supported");
  if (options.mode === "installation") return lookup(options.brandLocale, supported) ?? defaultLocale;

  const saved = lookup(options.savedLocale, supported);
  if (saved !== undefined) return saved;
  const preferences = (options.acceptLanguage ?? "").split(",").map((entry, index) => {
    const [range, ...parameters] = entry.trim().split(/\s*;\s*/);
    const quality = parameters.length === 0 ? 1
      : parameters.length === 1 && /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.test(parameters[0])
        ? Number(parameters[0].slice(2)) : 0;
    return { range, quality, index };
  }).filter(({ range, quality }) => range !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { range } of preferences) {
    const locale = lookup(range, supported);
    if (locale !== undefined) return locale;
  }
  return defaultLocale;
}
