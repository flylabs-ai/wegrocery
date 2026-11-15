import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { draftReminderDue, draftReminderMessage } from "./draft-reminder";

describe("draftReminderDue", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const ahead = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("includes deadlines from one to thirty hours away", () => {
    for (const minutes of [60, 1200, 1800]) expect(draftReminderDue(ahead(minutes), now)).toBe(true);
  });

  it("excludes deadlines outside the window, too close, expired or absent", () => {
    for (const minutes of [1801, 2400, 59, 0, -60]) expect(draftReminderDue(ahead(minutes), now)).toBe(false);
    expect(draftReminderDue(null, now)).toBe(false);
    expect(draftReminderDue("invalid", now)).toBe(false);
  });
});

describe("draftReminderMessage", () => {
  const input = { cycleTitle: "Test cycle", deadline: "15 Nov, 18:00" };

  it.each([false, true])("explains how to confirm a new order (card: %s)", (cardPayment) => {
    const message = draftReminderMessage({ ...input, kind: "new", cardPayment });
    expect(message.title).toContain(input.cycleTitle);
    expect(message.body).toContain(input.cycleTitle);
    expect(message.body).toContain(input.deadline);
    expect(message.body).toContain(cardPayment ? t.order.pay.payAndConfirm : t.order.confirmOrder);
    expect(message.body).toContain("will not be sent");
    expect(message.body.includes("complete the card payment")).toBe(cardPayment);
  });

  it.each([false, true])("keeps the confirmed order valid if changes are not confirmed (card: %s)", (cardPayment) => {
    const message = draftReminderMessage({ ...input, kind: "changes", cardPayment });
    expect(message.body).toContain(input.cycleTitle);
    expect(message.body).toContain(input.deadline);
    expect(message.body).toContain(cardPayment ? t.order.pay.payAndConfirm : t.order.confirmOrder);
    expect(message.body).toContain("confirmed order remains valid");
    expect(message.body.includes("complete the card payment")).toBe(cardPayment);
  });
});
