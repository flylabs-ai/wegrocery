import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider, createToastManager } from "./toast";
describe("ToastProvider", () => {
  it.each([undefined, "top", "bottom"] as const)("keeps children in SSR without a portal at position %s", (position) => expect(renderToStaticMarkup(<ToastProvider position={position} closeLabel="Close" viewportLabel="Notifications"><p>Body</p></ToastProvider>)).toBe("<p>Body</p>"));
  it("exposes Base UI managers scoped to the app, not one cross-app singleton", () => {
    const one = createToastManager(); const two = createToastManager();
    expect(one).not.toBe(two); expect(typeof one.add).toBe("function"); expect(typeof one.close).toBe("function");
  });
});
