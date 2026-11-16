import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Textarea } from "./textarea";
it("Textarea keeps native state, token shape and touch target", () => {
  const html = renderToStaticMarkup(<Textarea disabled rows={3} defaultValue="Example" />);
  expect(html).toMatch(/disabled=""/); expect(html).toContain("border-input");
  expect(html).toContain("--control-radius"); expect(html).toContain("pointer-coarse:");
});
