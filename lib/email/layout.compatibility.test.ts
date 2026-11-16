import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emailHtml } from "./layout";
import { WG, STELLAR, SAMPLE, OPTIONS } from "./layout.test.data";

// Captured from the two app renderers before extraction, with synthetic input.
// These are byte comparisons, not snapshots regenerated from the kit renderer.
describe("layout compatibility", () => {
  it.each([["wegrocery", WG], ["stellar", STELLAR]] as const)("preserves %s HTML byte for byte", (name, config) => {
    const expected = readFileSync(new URL(`./fixtures/${name}.test.html`, import.meta.url));
    expect(Buffer.from(emailHtml(SAMPLE, config, OPTIONS))).toEqual(expected);
  });
});
