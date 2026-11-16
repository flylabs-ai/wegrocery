import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, describedBy } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select } from "./select";
import { Checkbox } from "./checkbox";
describe("Field", () => {
  it.each(["input", "textarea", "select", "checkbox"])("connects label, help and error automatically for %s", (kind) => {
    const control = kind === "input" ? <Input /> : kind === "textarea" ? <Textarea /> : kind === "select" ? <Select><option>Example</option></Select> : <Checkbox />;
    const html = renderToStaticMarkup(<Field id="example" label="Example" hint="Help" error="Invalid" disabled>{control}</Field>);
    expect(html).toContain('for="example"'); expect(html).toContain('id="example-label"');
    expect(html).toContain('aria-describedby="example-hint example-error"'); expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="example-hint"'); expect(html).toContain('id="example-error"'); expect(html).toMatch(/disabled=""/);
  });
  it("does not overwrite an existing description and rejects a mismatched control id", () => {
    expect(renderToStaticMarkup(<Field id="x" label="Example" hint="Hint"><Input aria-describedby="extra" /></Field>)).toContain('aria-describedby="extra x-hint"');
    expect(() => renderToStaticMarkup(<Field id="x" label="Example"><Input id="other" /></Field>)).toThrow(/id/i);
    expect(describedBy("x", true, false)).toBe("x-hint"); expect(describedBy("x", false, false)).toBeUndefined();
  });
});
