import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog, ConfirmActions } from "./confirm-dialog";
describe("ConfirmDialog", () => {
  it("renders safely when closed, without a global request listener", () => expect(renderToStaticMarkup(<ConfirmDialog open={false} title="Confirm" confirmLabel="Continue" cancelLabel="Cancel" closeLabel="Close" onConfirm={() => undefined} onCancel={() => undefined} />)).toBe(""));
  it("requires app labels and keeps cancel enabled while submit is pending", () => {
    const html = renderToStaticMarkup(<ConfirmActions confirmLabel="Delete" cancelLabel="Keep" danger pending onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain("Delete"); expect(html).toContain("Keep"); expect(html).toMatch(/<button[^>]*disabled=""/); expect(html).toContain("bg-destructive text-destructive-foreground"); expect(html).not.toContain("bg-danger-bg"); expect(html).toContain('type="button"');
  });
});
