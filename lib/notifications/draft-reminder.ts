import type { CycleDraftSummary } from "@/lib/admin/cycle-drafts";
import { t } from "@/lib/i18n";

export const DRAFT_REMINDER_LEAD_HOURS = 30;
export const DRAFT_REMINDER_MIN_MINUTES = 60;

export function draftReminderDue(orderCloseAt: Date | string | null, now: Date): boolean {
  if (!orderCloseAt) return false;
  const remaining = new Date(orderCloseAt).getTime() - now.getTime();
  return remaining >= DRAFT_REMINDER_MIN_MINUTES * 60_000 && remaining <= DRAFT_REMINDER_LEAD_HOURS * 3_600_000;
}

export function draftReminderMessage({ kind, cardPayment, cycleTitle, deadline }: {
  kind: CycleDraftSummary["kind"];
  cardPayment: boolean;
  cycleTitle: string;
  deadline: string;
}): { title: string; body: string } {
  const s = t.notificationsServer;
  const action = cardPayment ? t.order.pay.payAndConfirm : t.order.confirmOrder;
  const body = kind === "new"
    ? cardPayment
      ? s.draftReminderNewCard(cycleTitle, deadline, action)
      : s.draftReminderNewWallet(cycleTitle, deadline, action)
    : cardPayment
      ? s.draftReminderChangesCard(cycleTitle, deadline, action)
      : s.draftReminderChangesWallet(cycleTitle, deadline, action);
  return { title: s.draftReminderTitle(cycleTitle), body };
}
