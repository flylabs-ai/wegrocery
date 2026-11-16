import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";
describe("Button", () => {
  it("defaults to a primary type=button with shape and height tokens", () => {
    const html = renderToStaticMarkup(<Button>Continue</Button>);
    expect(html).toContain('type="button"'); expect(html).toContain("bg-primary text-primary-foreground");
    expect(html).toContain("rounded-(--control-radius)"); expect(html).toContain("min-h-(--control-h)"); expect(html).toContain("pointer-coarse:min-h-11");
    expect(html).toContain("outline-ring");
  });
  it.each(["inverse", "secondary", "outline", "ghost", "destructive", "destructive-soft", "accent", "brand"] as const)("renders the role variant %s", (variant) => expect(renderToStaticMarkup(<Button variant={variant}>Action</Button>)).toContain('data-slot="button"'));
  it("reserves the filled destructive role for the main action and preserves the soft role", () => {
    const filled = buttonVariants({ variant: "destructive" });
    expect(filled).toContain("bg-destructive text-destructive-foreground");
    expect(filled).toContain("hover:bg-[oklch(from_var(--destructive)_calc(l*0.9)_c_h)]");
    expect(filled).not.toContain("bg-danger-bg");
    const soft = buttonVariants({ variant: "destructive-soft" });
    expect(soft).toContain("bg-danger-bg text-destructive");
    expect(soft).not.toContain("text-destructive-foreground");
  });
  it("preserves disabled submit and block, and keeps brand as a primary alias", () => {
    const html = renderToStaticMarkup(<Button disabled type="submit" size="sm" block>Save</Button>);
    expect(html).toContain('type="submit"'); expect(html).toMatch(/disabled=""/); expect(html).toContain("w-full");
    expect(buttonVariants({ variant: "brand" })).toBe(buttonVariants({ variant: "default" }));
  });
  it("requires an accessible name for an icon button", () => {
    const html = renderToStaticMarkup(<Button size="icon" aria-label="Close">x</Button>);
    expect(html).toContain('aria-label="Close"');
    expect(() => renderToStaticMarkup(<Button size="icon" aria-label="">x</Button>)).toThrow(/label/i);
  });
});
