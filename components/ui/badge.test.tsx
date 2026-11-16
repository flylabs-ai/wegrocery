import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Badge } from "./badge";
it("badge uses role tokens and accessible static markup", () => {
  const html = renderToStaticMarkup(<Badge variant="success">Ready</Badge>);
  expect(html).toContain("data-slot=\"badge\"");
  expect(html).toContain("bg-success-bg");
  expect(html).toContain("--control-radius");
});
it("keeps both apps' badge entry points, including the WeGrocery dot", () => {
  expect(renderToStaticMarkup(<Badge tone="danger" dot>Review</Badge>)).toContain("bg-danger-bg");
  expect(renderToStaticMarkup(<Badge tone="danger" dot>Review</Badge>)).toContain('aria-hidden="true"');
  expect(renderToStaticMarkup(<Badge variant="brand">Review</Badge>)).toContain("bg-primary-bg");
});
