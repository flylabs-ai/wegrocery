import { describe, expect, it } from "vitest";
import { compareParity } from "./parity";

describe("compareParity", () => {
  it("accepts translated text with the same shape, placeholders and function arity", () => {
    const ref = { title: "Hello {name}", count: (n: number) => String(n), nested: { enabled: true } };
    const other = { title: "Ciao {name}", count: (total: number) => `${total}`, nested: { enabled: false } };
    expect(compareParity(ref, other)).toEqual([]);
  });

  it("reports missing and extra own keys with their full paths", () => {
    expect(compareParity({ nested: { missing: "text" } }, { nested: { extra: "text" } }, "en")).toEqual([
      { kind: "extra-key", path: "en.nested.extra" },
      { kind: "missing-key", path: "en.nested.missing" },
    ]);
  });

  it("reports a type mismatch without cascading into the missing subtree", () => {
    expect(compareParity({ nested: { title: "text" } }, { nested: "text" })).toEqual([
      { kind: "type", path: "nested", expected: "object", actual: "string" },
    ]);
  });

  it("distinguishes null, arrays and objects and supports root differences", () => {
    expect(compareParity(null, {})).toEqual([{ kind: "type", path: "$", expected: "null", actual: "object" }]);
    expect(compareParity(["text"], {})).toEqual([{ kind: "type", path: "$", expected: "array", actual: "object" }]);
    expect(compareParity({ nil: null }, { nil: null })).toEqual([]);
    expect(compareParity(["text"], ["text", "extra"])).toEqual([{ kind: "extra-key", path: "1" }]);
  });

  it("compares placeholder names and occurrences, independently of order", () => {
    expect(compareParity("{first} {last}", "{last} {first}")).toEqual([]);
    expect(compareParity({ title: "{name} {name}" }, { title: "{name} {other}" })).toEqual([
      { kind: "placeholders", path: "title", expected: ["name", "name"], actual: ["name", "other"] },
    ]);
  });

  it("reports a changed function arity without calling either function", () => {
    // The parameters are used, so the copy passes an app's lint with --max-warnings 0.
    const ref = (one: string, two: string) => { throw new Error(`Must not run: ${one}${two}`); };
    const other = (one: string) => { throw new Error(`Must not run: ${one}`); };
    expect(compareParity({ label: ref }, { label: other })).toEqual([
      { kind: "arity", path: "label", expected: 2, actual: 1 },
    ]);
  });

  it("does not accept inherited properties as translated keys or mutate packs", () => {
    const ref = Object.freeze({ title: "text" });
    const other = Object.create({ title: "inherited" });
    expect(compareParity(ref, other)).toEqual([{ kind: "missing-key", path: "title" }]);
  });
});
