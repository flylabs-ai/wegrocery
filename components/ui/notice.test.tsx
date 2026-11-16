import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Notice } from "./notice";
it("notice uses role tokens and accessible static markup", () => {
  const html = renderToStaticMarkup(<Notice tone="danger">Invalid</Notice>);
  expect(html).toContain("role=\"alert\"");
  expect(html).toContain("text-destructive");
  expect(html).toContain("aria-hidden=\"true\"");
});
