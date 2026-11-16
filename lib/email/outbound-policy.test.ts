import { describe, expect, it } from "vitest";
import { REDIRECT_BATCH_CAP, resolveOutbound, resolveOutboundBatch } from "./outbound-policy";

const message = { to: "member@example.com", cc: ["copy@example.com"], subject: "Update", text: "Example" };
const blocked = "Email disabled in this environment";
describe("resolveOutbound", () => {
  it("sends unchanged only in Vercel production and copies cc", () => {
    const decision = resolveOutbound(message, { vercelEnv: "production", redirectTo: "test@example.test" }, blocked);
    expect(decision).toEqual({ action: "send", to: message.to, cc: message.cc, subject: message.subject });
    if (decision.action === "send") expect(decision.cc).not.toBe(message.cc);
  });
  it("blocks without a redirect in every other environment", () => {
    for (const vercelEnv of [undefined, "preview", "development", "staging", "Production"]) {
      expect(resolveOutbound(message, { vercelEnv, redirectTo: " " }, blocked)).toEqual({ action: "block", error: blocked });
    }
  });
  it("redirects with the original recipient in the subject and removes cc", () => {
    expect(resolveOutbound(message, { vercelEnv: "preview", redirectTo: " test@example.test " }, blocked)).toEqual({
      action: "send", to: "test@example.test", cc: [], subject: "[STAGING -> member@example.com] Update",
    });
  });
});
describe("resolveOutboundBatch", () => {
  it("caps redirected broadcasts and retains message metadata without cc", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ ...message, to: `member${i}@example.com`, headers: { Example: "value" }, heading: "News" }));
    const decision = resolveOutboundBatch(items, { vercelEnv: "preview", redirectTo: "test@example.test" }, blocked);
    expect(REDIRECT_BATCH_CAP).toBe(3);
    expect(decision.action).toBe("send");
    if (decision.action === "send") {
      expect(decision.messages).toHaveLength(REDIRECT_BATCH_CAP);
      expect(decision.suppressed).toBe(4);
      expect(decision.messages[0]).toMatchObject({ to: "test@example.test", subject: "[STAGING -> member0@example.com] Update", headers: { Example: "value" }, heading: "News", text: "Example" });
      expect(decision.messages[0]).not.toHaveProperty("cc");
    }
    expect(items[0].to).toBe("member0@example.com");
  });
  it("keeps the full production batch, blocks previews and accepts an empty batch", () => {
    const items = Array.from({ length: 5 }, () => message);
    const production = resolveOutboundBatch(items, { vercelEnv: "production" }, blocked);
    if (production.action === "send") { expect(production.messages).toHaveLength(5); expect(production.suppressed).toBe(0); }
    else throw new Error("Production unexpectedly blocked");
    expect(resolveOutboundBatch(items, { vercelEnv: undefined }, blocked)).toEqual({ action: "block", error: blocked });
    expect(resolveOutboundBatch([], { vercelEnv: undefined }, blocked)).toEqual({ action: "send", messages: [], suppressed: 0 });
  });
});
