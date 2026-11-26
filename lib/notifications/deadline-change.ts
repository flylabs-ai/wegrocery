// Pure helper for the "deadline changed" notice (cycle_deadline_changed,
// category cycle_opened): an admin moved the close of a cycle whose orders
// are open. The cycle_opened notice keeps the time it was sent with, so the
// members who can order hear the new one. The DB reads and the dispatch live
// in adminUpdateCycle (lib/actions/admin.ts).

import { t } from "@/lib/i18n";
import { formatDeadlineLong } from "@/lib/i18n/deadline";

/**
 * Title and body of the notice, or null when members would read the same
 * deadline, when there is none, or when the new one has already passed (an
 * admin closing the orders early is not news to order by).
 */
export function deadlineNotice(
  cycleTitle: string,
  before: Date | null,
  after: Date | null,
  now: Date,
): { title: string; body: string } | null {
  if (!before || !after || after.getTime() <= now.getTime()) return null;
  const was = formatDeadlineLong(before);
  const is = formatDeadlineLong(after);
  if (was === is) return null;
  const s = t.notificationsServer;
  return {
    title: after.getTime() < before.getTime() ? s.deadlineEarlierTitle(cycleTitle) : s.deadlineLaterTitle(cycleTitle),
    body: s.deadlineChangedBody(cycleTitle, is, was),
  };
}
