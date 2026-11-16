import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";
const labels = { skip: "Skip to content", navigation: "Main", more: "More", close: "Close" };
const items = [{ href: "/", label: "Home", icon: <span aria-hidden="true">H</span> }, { href: "/settings", label: "Settings", icon: <span aria-hidden="true">S</span>, badge: "2" }];
describe("AppShell", () => {
  it("links the skip link to a focusable main and labels navigation and active links", () => {
    const html = renderToStaticMarkup(<AppShell items={items} pathname="/settings" labels={labels} brand={<span>Example</span>} actions={<span>Actions</span>}>Body</AppShell>);
    expect(html).toContain('href="#main"'); expect(html).toContain('<main id="main" tabindex="-1"'); expect(html).toContain('aria-label="Main"'); expect(html).toContain('aria-current="page"'); expect(html).toContain("safe-area-inset-bottom");
  });
  it("renders children only under the active sidebar parent and gives the current child aria-current", () => {
    const tree = [
      { href: "/section", label: "Section", icon: null, children: [{ href: "/section?view=one", label: "One", icon: null }, { href: "/section?view=two", label: "Two", icon: null }] },
      { href: "/other", label: "Other", icon: null, children: [{ href: "/other/details", label: "Hidden child", icon: null }] },
    ];
    const html = renderToStaticMarkup(<AppShell items={tree} pathname="/section" search="?view=two" labels={labels} wideFrom="lg">Body</AppShell>);
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];
    const parents = anchors.filter((anchor) => anchor.includes('href="/section"'));
    expect(parents).toHaveLength(2);
    for (const parent of parents) { expect(parent).toContain("bg-secondary text-primary-text"); expect(parent).not.toContain("aria-current"); }
    expect(anchors.find((anchor) => anchor.includes('href="/section?view=two"'))).toContain('aria-current="page"');
    expect(anchors.find((anchor) => anchor.includes('href="/section?view=one"'))).not.toContain("aria-current");
    expect(html.match(/href="\/section\?view=two"/g)).toHaveLength(1);
    expect(html).toContain("hidden lg:flex"); expect(html).not.toContain("Hidden child");
  });
  it("declares the mobile bottom offset on the shell root and resets it from md", () => {
    const html = renderToStaticMarkup(<AppShell items={items} pathname="/" labels={labels}>Body</AppShell>);
    expect(html).toContain("--app-bottom:"); expect(html).toContain("md:[--app-bottom:0px]");
    expect(html).toContain("pb-[calc(var(--app-bottom)+1rem)]");
  });
  it("keeps More in the phone bar when the app chooses fewer primary destinations", () => {
    const html = renderToStaticMarkup(<AppShell items={items} pathname="/settings" labels={labels} mobileCount={1} mainId="content">Body</AppShell>);
    expect(html).toContain('href="#content"'); expect(html).toContain('id="content"'); expect(html).toContain("More"); expect(html).toContain('aria-haspopup="dialog"');
  });
  it("does not add an empty More menu for a null app slot", () => {
    const html = renderToStaticMarkup(<AppShell items={items} pathname="/" labels={labels} moreContent={null}>Body</AppShell>);
    expect(html).not.toContain('aria-haspopup="dialog"');
  });
});
