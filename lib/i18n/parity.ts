export type ParityDifference =
  | { kind: "missing-key" | "extra-key"; path: string }
  | { kind: "type"; path: string; expected: string; actual: string }
  | { kind: "placeholders"; path: string; expected: string[]; actual: string[] }
  | { kind: "arity"; path: string; expected: number; actual: number };

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** Compare acyclic translation packs without evaluating their functions. */
export function compareParity(reference: unknown, other: unknown, root = ""): ParityDifference[] {
  const differences: ParityDifference[] = [];
  const walk = (ref: unknown, candidate: unknown, path: string): void => {
    const expected = valueType(ref);
    const actual = valueType(candidate);
    const location = path || "$";
    if (expected !== actual) {
      differences.push({ kind: "type", path: location, expected, actual });
    } else if (typeof ref === "string") {
      const expectedTokens = placeholders(ref);
      const actualTokens = placeholders(candidate as string);
      if (expectedTokens.length !== actualTokens.length || expectedTokens.some((token, i) => token !== actualTokens[i])) {
        differences.push({ kind: "placeholders", path: location, expected: expectedTokens, actual: actualTokens });
      }
    } else if (typeof ref === "function") {
      const arity = (candidate as { length: number }).length;
      if (ref.length !== arity) differences.push({ kind: "arity", path: location, expected: ref.length, actual: arity });
    } else if (ref !== null && typeof ref === "object") {
      const translated = candidate as Record<string, unknown>;
      const source = ref as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(source), ...Object.keys(translated)])].sort();
      for (const key of keys) {
        const keyPath = path ? `${path}.${key}` : key;
        if (!Object.hasOwn(source, key)) differences.push({ kind: "extra-key", path: keyPath });
        else if (!Object.hasOwn(translated, key)) differences.push({ kind: "missing-key", path: keyPath });
        else walk(source[key], translated[key], keyPath);
      }
    }
  };
  walk(reference, other, root);
  return differences;
}
