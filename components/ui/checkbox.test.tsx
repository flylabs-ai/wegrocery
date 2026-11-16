import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Checkbox } from "./checkbox";
it("Checkbox keeps native state, token shape and touch target", () => {
  const html = renderToStaticMarkup(<Checkbox disabled defaultChecked aria-label="Example" />);
  expect(html).toMatch(/disabled=""/); expect(html).toContain("border-input");
  expect(html).toContain("--control-radius"); expect(html).toContain("pointer-coarse:");
});
