import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicShell } from "./public-shell";
it("PublicShell keeps branding, actions and legal text in app-owned slots", () => {
  const html = renderToStaticMarkup(<PublicShell brand={<span>Example</span>} actions={<a href="/language">Language</a>} footer={<span>Legal</span>} skipLabel="Skip">Body</PublicShell>);
  expect(html).toContain('href="#main"'); expect(html).toContain('<main id="main" tabindex="-1"'); expect(html).toContain("Example"); expect(html).toContain("Legal");
});
