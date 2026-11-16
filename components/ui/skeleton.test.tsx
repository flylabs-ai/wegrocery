import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Skeleton } from "./skeleton";
it("skeleton uses role tokens and accessible static markup", () => {
  const html = renderToStaticMarkup(<Skeleton className="h-8" />);
  expect(html).toContain("aria-hidden=\"true\"");
  expect(html).toContain("motion-safe:animate-pulse");
  expect(html).toContain("bg-secondary");
});
