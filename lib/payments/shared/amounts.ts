export type CentsOptions = { allowNegative?: boolean };

export function assertCents(value: unknown, { allowNegative = false }: CentsOptions = {}): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (!allowNegative && value < 0)) throw new Error("Invalid integer cents");
}

/** No decimal Number conversion, rounding, signs or thousands separators. */
export function eurosToCents(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Invalid euro amount");
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid euro amount");
  return Number(cents);
}

/** Use integer whole euros and replace only the localized fractional digits. */
export function formatCents(cents: number, locale: string, options: CentsOptions = {}): string {
  assertCents(cents, options);
  const integer = BigInt(cents);
  const whole = integer / BigInt(100);
  const remainder = Number((integer < BigInt(0) ? -integer : integer) % BigInt(100));
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fraction = new Intl.NumberFormat(locale, { numberingSystem: formatter.resolvedOptions().numberingSystem, useGrouping: false, minimumIntegerDigits: 2 }).format(remainder);
  return formatter.formatToParts(cents < 0 && whole === BigInt(0) ? -0 : whole).map((part) => part.type === "fraction" ? fraction : part.value).join("");
}
