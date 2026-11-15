import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { members, orderCycles, orderDrafts, orders, products, type DraftLine } from "@/lib/db/schema";
import { summarizeCycleDrafts } from "@/lib/admin/cycle-drafts";
import { formatDeadline } from "@/lib/i18n/deadline";
import { normalizeDraftLines } from "@/lib/order-draft";
import { canAccessCycle } from "@/lib/roles";
import { dispatchWithBodies } from "./dispatch";
import { DRAFT_REMINDER_LEAD_HOURS, DRAFT_REMINDER_MIN_MINUTES, draftReminderDue, draftReminderMessage } from "./draft-reminder";

type Db = ReturnType<typeof getDb>;

export async function sendDraftReminders(db: Db, now: Date): Promise<{ sent: number; cycles: number }> {
  const cycles = await db
    .select({ cycleId: orderCycles.cycleId, title: orderCycles.title, accessLevel: orderCycles.accessLevel,
      paymentMode: orderCycles.paymentMode, orderCloseAt: orderCycles.orderCloseAt })
    .from(orderCycles)
    .where(and(
      eq(orderCycles.status, "open"),
      gte(orderCycles.orderCloseAt, new Date(now.getTime() + DRAFT_REMINDER_MIN_MINUTES * 60_000)),
      lte(orderCycles.orderCloseAt, new Date(now.getTime() + DRAFT_REMINDER_LEAD_HOURS * 3_600_000)),
    ));
  let sent = 0;
  let sentCycles = 0;

  for (const cycle of cycles) {
    if (!cycle.orderCloseAt || !draftReminderDue(cycle.orderCloseAt, now)) continue;
    const drafts = (await db
      .select({ memberId: members.memberId, name: members.fullName, email: members.email, role: members.role,
        paysOffline: members.paysOffline, lines: orderDrafts.lines, updatedAt: orderDrafts.updatedAt })
      .from(orderDrafts)
      .innerJoin(members, eq(orderDrafts.memberId, members.memberId))
      .where(and(eq(orderDrafts.cycleId, cycle.cycleId), eq(members.active, true), isNull(members.mergedInto))))
      .filter((draft) => canAccessCycle(cycle.accessLevel, draft.role));
    if (drafts.length === 0) continue;

    const [cycleProducts, confirmed] = await Promise.all([
      db.select({ productId: products.productId, unitPrice: products.unitPrice })
        .from(products).where(and(eq(products.cycleId, cycle.cycleId), eq(products.active, true))),
      db.select({ memberId: orders.memberId, productId: orders.productId, quantity: orders.quantity })
        .from(orders).where(and(eq(orders.cycleId, cycle.cycleId), inArray(orders.memberId, drafts.map((draft) => draft.memberId)))),
    ]);
    const confirmedByMember = new Map<string, DraftLine[]>();
    for (const line of confirmed) {
      const lines = confirmedByMember.get(line.memberId) ?? [];
      lines.push({ productId: line.productId, quantity: line.quantity });
      confirmedByMember.set(line.memberId, lines);
    }
    const summaries = summarizeCycleDrafts(
      drafts.map((draft) => ({ ...draft, lines: normalizeDraftLines(draft.lines) })), cycleProducts, confirmedByMember,
    );
    if (summaries.length === 0) continue;

    // One guarded reservation statement. Replays and concurrent runs get no
    // rows back; a confirm that already removed the draft is left alone.
    const candidates = sql.join(summaries.map((draft) => sql`${draft.memberId}`), sql`, `);
    const reserved = await db.execute<{ member_id: string }>(sql`
      INSERT INTO draft_reminders (cycle_id, member_id, sent_at)
      SELECT c.cycle_id, m.member_id, ${now}
      FROM order_cycles c CROSS JOIN members m
      WHERE c.cycle_id = ${cycle.cycleId} AND c.status = 'open' AND c.order_close_at > ${now}
        AND m.member_id IN (${candidates}) AND m.active AND m.merged_into IS NULL
        AND EXISTS (SELECT 1 FROM order_drafts d WHERE d.cycle_id = c.cycle_id AND d.member_id = m.member_id)
      ON CONFLICT (cycle_id, member_id) DO NOTHING RETURNING member_id
    `);
    if (reserved.rows.length === 0) continue;

    const reservedIds = new Set(reserved.rows.map((row) => row.member_id));
    const owners = new Map(drafts.map((draft) => [draft.memberId, draft]));
    const items = summaries.filter((draft) => reservedIds.has(draft.memberId)).map((draft) => {
      const owner = owners.get(draft.memberId)!;
      return {
        memberId: draft.memberId,
        email: owner.email,
        href: `/ordine?cycleId=${encodeURIComponent(cycle.cycleId)}`,
        ...draftReminderMessage({ kind: draft.kind, cardPayment: cycle.paymentMode === "per_order" && !owner.paysOffline,
          cycleTitle: cycle.title, deadline: formatDeadline(cycle.orderCloseAt!) }),
      };
    });
    await dispatchWithBodies(db, items, "order_draft_reminder", now);
    sent += items.length;
    sentCycles += 1;
  }

  return { sent, cycles: sentCycles };
}
