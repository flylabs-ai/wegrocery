import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Label } from "./label";
it("Label connects a control without owning visible wording", () => {
  const html = renderToStaticMarkup(<Label htmlFor="field">Example</Label>);
  expect(html).toContain('for="field"'); expect(html).toContain(">Example</label>");
});
