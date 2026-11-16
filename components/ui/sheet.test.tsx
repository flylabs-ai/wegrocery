import { Dialog } from "@base-ui/react/dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sheet, SheetHeading } from "./sheet";
describe("Sheet", () => {
  it("is safe to render during SSR without a document or an open portal", () => expect(renderToStaticMarkup(<Sheet open={false} onRequestClose={() => undefined} title="Example" closeLabel="Close">Body</Sheet>)).toBe(""));
  it("connects the dialog title and description and names its icon-only close", () => {
    const html = renderToStaticMarkup(<Dialog.Root open><SheetHeading title="Example" subtitle="Details" closeLabel="Close" onRequestClose={() => undefined} /></Dialog.Root>);
    expect(html).toContain("<h2"); expect(html).toContain("Example"); expect(html).toContain("Details"); expect(html).toContain('aria-label="Close"'); expect(html).toMatch(/<h2[^>]*id=/);
  });
});
