import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "./card";
it("card uses role tokens and accessible static markup", () => {
  const html = renderToStaticMarkup(<Card><CardHeader><CardTitle>Example</CardTitle><CardDescription>Details</CardDescription><CardAction>Action</CardAction></CardHeader><CardContent>Body</CardContent><CardFooter>Footer</CardFooter></Card>);
  expect(html).toContain("bg-card");
  expect(html).toContain("border-border");
  expect(html).toContain("--radius");
  expect(html).toContain("data-slot=\"card-title\"");
});
it("keeps Stellar's compact card size as explicit state", () => {
  expect(renderToStaticMarkup(<Card size="sm">Example</Card>)).toContain('data-size="sm"');
});
