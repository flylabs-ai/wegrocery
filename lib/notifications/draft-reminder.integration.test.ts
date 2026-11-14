import { afterAll, beforeAll, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { mergeMembers } from "@/lib/members/merge-store";
import { describeDb, makeScope } from "@/test/int/fixtures";
import { sendDraftReminders } from "./draft-reminder-store";

describeDb("draft reminders", () => {
  const scope = makeScope("draftreminder");
  const { sql } = scope;
  const now = new Date("2031-04-05T10:00:00Z");

  beforeAll(async () => { await scope.createMember(); });
  afterAll(async () => { await scope.cleanup(); });

  async function cycle(name: string, hours = 20, status = "open", access = "utenti") {
    const result = await scope.createCycle(name, { products: [{ name: "Test Apples", unitPrice: 2 }] });
    await sql`UPDATE order_cycles SET order_close_at = ${new Date(now.getTime() + hours * 3_600_000)},
      status = ${status}, access_level = ${access} WHERE cycle_id = ${result.cycleId}`;
    return { cycleId: result.cycleId, productId: result.productIds[0] };
  }

  async function draft(c: { cycleId: string; productId: string }, memberId = scope.memberId, quantity = 2, confirmed?: number) {
    if (confirmed !== undefined) {
      await sql`INSERT INTO orders (order_line_id, cycle_id, member_id, product_id, quantity,
          unit_price_snapshot, line_total, updated_at)
        VALUES (${scope.id(crypto.randomUUID())}, ${c.cycleId}, ${memberId}, ${c.productId}, ${confirmed},
          2, ${confirmed * 2}, ${now})`;
    }
    await sql`INSERT INTO order_drafts (cycle_id, member_id, lines, updated_at)
      VALUES (${c.cycleId}, ${memberId}, ${JSON.stringify([{ productId: c.productId, quantity }])}::jsonb, ${now})`;
  }

  it("sends once for a new order and changes, returning only counts", async () => {
    const c = await cycle("eligible");
    const editing = await scope.createExtraMember("editing");
    await draft(c);
    await draft(c, editing, 3, 1);
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 2, cycles: 1 });
    const rows = await sql`SELECT member_id, title, body, href FROM notifications
      WHERE type = 'order_draft_reminder' AND member_id IN (${scope.memberId}, ${editing}) ORDER BY member_id`;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.member_id === scope.memberId)?.body).toContain("will not be sent");
    expect(rows.find((row) => row.member_id === editing)?.body).toContain("confirmed order remains valid");
    for (const row of rows) expect(row.href).toBe(`/ordine?cycleId=${c.cycleId}`);
    expect(await sql`SELECT 1 FROM draft_reminders WHERE cycle_id = ${c.cycleId}`).toHaveLength(2);
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 0, cycles: 0 });
    expect(await sql`SELECT 1 FROM notifications WHERE type = 'order_draft_reminder'
      AND member_id IN (${scope.memberId}, ${editing})`).toHaveLength(2);
  });

  it("excludes equal drafts, inactive or merged members, inaccessible cycles and deadlines outside the window", async () => {
    await draft(await cycle("equal"), scope.memberId, 1, 1);
    const inactive = await scope.createExtraMember("inactive");
    await draft(await cycle("inactive"), inactive);
    await sql`UPDATE members SET active = false WHERE member_id = ${inactive}`;
    const merged = await scope.createExtraMember("merged");
    await draft(await cycle("merged"), merged);
    await sql`UPDATE members SET merged_into = ${scope.memberId} WHERE member_id = ${merged}`;
    await draft(await cycle("future", 40));
    await draft(await cycle("close", 0.5));
    await draft(await cycle("expired", -1));
    await draft(await cycle("closed", 20, "closed"));
    await draft(await cycle("private", 20, "open", "admin"));
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 0, cycles: 0 });
    expect(await sql`SELECT 1 FROM draft_reminders WHERE member_id IN (${inactive}, ${merged})`).toHaveLength(0);
  });

  it("uses card instructions only for members who pay online on a card cycle", async () => {
    const online = await scope.createExtraMember("online");
    const offline = await scope.createExtraMember("offline", { paysOffline: true });
    const { cycleId, productIds } = await scope.createCycle("card", {
      paymentMode: "per_order", products: [{ name: "Test Apples", unitPrice: 2 }],
    });
    await sql`UPDATE order_cycles SET order_close_at = ${new Date(now.getTime() + 20 * 3_600_000)},
      access_level = 'utenti' WHERE cycle_id = ${cycleId}`;
    const c = { cycleId, productId: productIds[0] };
    await draft(c, online);
    await draft(c, offline);
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 2, cycles: 1 });
    const rows = await sql`SELECT member_id, body FROM notifications
      WHERE type = 'order_draft_reminder' AND member_id IN (${online}, ${offline})`;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.member_id === online)?.body).toContain("complete the card payment");
    expect(rows.find((row) => row.member_id === offline)?.body).toContain('"Confirm order"');
    expect(rows.find((row) => row.member_id === offline)?.body).not.toContain("card payment");
  });

  it("records the reservation when the app preference is off without inserting an app notification", async () => {
    const c = await cycle("appoff");
    await draft(c);
    await sql`INSERT INTO notification_preferences (member_id, category, app_enabled, email_enabled, updated_at)
      VALUES (${scope.memberId}, 'draft_reminder', false, true, ${now})`;
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 1, cycles: 1 });
    expect(await sql`SELECT 1 FROM draft_reminders WHERE cycle_id = ${c.cycleId}`).toHaveLength(1);
    expect(await sql`SELECT 1 FROM notifications WHERE member_id = ${scope.memberId}
      AND type = 'order_draft_reminder' AND href = ${`/ordine?cycleId=${c.cycleId}`}`).toHaveLength(0);
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 0, cycles: 0 });
  });

  it("lets concurrent runs reserve a draft only once", async () => {
    const member = await scope.createExtraMember("concurrent");
    const c = await cycle("concurrent");
    await draft(c, member);
    const results = await Promise.all([sendDraftReminders(getDb(), now), sendDraftReminders(getDb(), now)]);
    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
    expect(await sql`SELECT 1 FROM draft_reminders WHERE cycle_id = ${c.cycleId}`).toHaveLength(1);
    expect(await sql`SELECT 1 FROM notifications WHERE member_id = ${member} AND type = 'order_draft_reminder'`).toHaveLength(1);
  });

  it.each(["merge", "link"] as const)("moves reservations during a member %s, keeping the earliest date", async (mode) => {
    const survivorId = await scope.createExtraMember(`survivor_${mode}`);
    const absorbedId = await scope.createExtraMember(`absorbed_${mode}`);
    const collision = await cycle(`collision_${mode}`);
    const kept = await cycle(`kept_${mode}`);
    const moved = await cycle(`moved_${mode}`);
    await draft(moved, absorbedId);
    const earliest = new Date(now.getTime() - 2 * 3_600_000);
    await sql`INSERT INTO draft_reminders (cycle_id, member_id, sent_at) VALUES
      (${collision.cycleId}, ${survivorId}, ${now}),
      (${collision.cycleId}, ${absorbedId}, ${earliest}),
      (${kept.cycleId}, ${survivorId}, ${earliest}),
      (${kept.cycleId}, ${absorbedId}, ${now}),
      (${moved.cycleId}, ${absorbedId}, ${earliest})`;
    const result = await mergeMembers(getDb(), {
      survivorId, absorbedId, actingMemberId: scope.memberId, adminEmail: "merge@example.invalid", mode,
    });
    expect(result.decision.ok).toBe(true);
    expect(await sql`SELECT 1 FROM draft_reminders WHERE member_id = ${absorbedId}`).toHaveLength(0);
    const reservations = await sql`SELECT cycle_id, extract(epoch FROM sent_at) * 1000 AS sent_ms
      FROM draft_reminders WHERE member_id = ${survivorId} ORDER BY cycle_id`;
    expect(reservations.map((row) => ({ cycleId: row.cycle_id, sentAt: Number(row.sent_ms) }))).toEqual([
      { cycleId: collision.cycleId, sentAt: earliest.getTime() },
      { cycleId: kept.cycleId, sentAt: earliest.getTime() },
      { cycleId: moved.cycleId, sentAt: earliest.getTime() },
    ]);
    expect(await sql`SELECT 1 FROM order_drafts WHERE cycle_id = ${moved.cycleId} AND member_id = ${survivorId}`).toHaveLength(1);
    expect(await sendDraftReminders(getDb(), now)).toEqual({ sent: 0, cycles: 0 });
  });
});
