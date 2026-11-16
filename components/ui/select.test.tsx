import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Select } from "./select";
it("Select keeps native state, token shape and touch target", () => {
  const html = renderToStaticMarkup(<Select disabled defaultValue="b"><option value="a">A</option><option value="b">B</option></Select>);
  expect(html).toMatch(/disabled=""/); expect(html).toContain("border-input");
  expect(html).toContain("--control-radius"); expect(html).toContain("pointer-coarse:");
});
