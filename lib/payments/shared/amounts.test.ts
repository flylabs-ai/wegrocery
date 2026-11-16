import { describe, expect, it } from "vitest";
import { assertCents, eurosToCents, formatCents } from "./amounts";

describe("integer cents", () => {
  it("validates safe integers, with negative values only when explicitly allowed", () => {
    for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) expect(() => assertCents(value)).not.toThrow();
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "100", null]) expect(() => assertCents(value)).toThrow();
    expect(() => assertCents(-1, { allowNegative: true })).not.toThrow();
  });
  it.each([["12,50",1250], ["12.50",1250], [" 0.1 ",10], ["12",1200], ["0",0], ["90071992547409.91",Number.MAX_SAFE_INTEGER]] as const)("converts %s without floating decimal arithmetic", (text, cents) => {
    expect(eurosToCents(text)).toBe(cents);
  });
  it.each(["", "-1", "+1", "1e2", "1.234", "1,000.00", "12.", ".50", "90071992547409.92", "Infinity"])("rejects ambiguous or unsafe amounts: %s", (text) => {
    expect(() => eurosToCents(text)).toThrow();
  });
  it("formats euro cents in an explicit locale, including exact safe-integer boundaries", () => {
    expect(formatCents(1250, "it-IT")).toBe("12,50 €");
    expect(formatCents(1250, "en-US")).toBe("€12.50");
    expect(formatCents(Number.MAX_SAFE_INTEGER, "it-IT")).toBe("90.071.992.547.409,91 €");
    expect(formatCents(-1250, "it-IT", { allowNegative: true })).toBe("-12,50 €");
    expect(() => formatCents(-1, "it-IT")).toThrow();
  });
});
