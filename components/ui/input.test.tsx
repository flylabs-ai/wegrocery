import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Input } from "./input";
it("Input keeps native state, token shape and touch target", () => {
  const html = renderToStaticMarkup(<Input disabled type="email" name="email" defaultValue="member@example.test" />);
  expect(html).toMatch(/disabled=""/); expect(html).toContain("border-input");
  expect(html).toContain("--control-radius"); expect(html).toContain("pointer-coarse:");
});
