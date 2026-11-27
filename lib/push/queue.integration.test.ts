import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { describeDb, makeScope } from "@/test/int/fixtures";
import { sendDraftReminders } from "@/lib/notifications/draft-reminder-store";
import { runPushQueue } from "./queue-runtime";
import { sendPush } from "./transport";
import { cleanPushQueue, draftReminderEventKey, processPushQueue, type QueueDeps, type QueueOutcome } from "./queue";

// WGR-03/04/05/08 on the real tables (migration 0057), with a fake sender:
// no push service is called, every endpoint is synthetic.
describeDb("draft reminder push queue (WGR-03/04/05)", () => {
  const scope = makeScope("pushqueue");
  const { sql } = scope;
  const now = new Date("2031-05-06T10:00:00Z");
  const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
  let relative: string;

  beforeAll(async () => {
    await scope.createMember();
    relative = await scope.createExtraMember("relative");
    await sql`UPDATE members SET household_of = ${scope.memberId} WHERE member_id = ${relative}`;
  });
  afterAll(() => scope.cleanup());
  beforeEach(async () => {
    await sql`DELETE FROM push_subscriptions WHERE person_id IN (${scope.memberId}, ${relative})`;
    await sql`DELETE FROM push_consents WHERE person_id IN (${scope.memberId}, ${relative})`;
  });

  async function device(personId: string, name: string, consent = true): Promise<string> {
    const id = scope.id(`sub_${name}`);
    await sql`INSERT INTO push_subscriptions (subscription_id, person_id, endpoint, p256dh, auth)
      VALUES (${id}, ${personId}, ${`https://fcm.googleapis.com/fcm/send/${id}`}, ${keys.p256dh}, ${keys.auth})`;
    await sql`INSERT INTO push_consents (person_id, category, enabled) VALUES (${personId}, 'draft_reminder', ${consent})
      ON CONFLICT (person_id, category) DO UPDATE SET enabled = ${consent}`;
    return id;
  }

  async function cycleWithDraft(name: string, memberId = scope.memberId): Promise<string> {
    const created = await scope.createCycle(name, { products: [{ name: "Test Pears", unitPrice: 2 }] });
    await sql`UPDATE order_cycles SET order_close_at = ${new Date(now.getTime() + 20 * 3_600_000)}, status = 'open',
      access_level = 'utenti' WHERE cycle_id = ${created.cycleId}`;
    await sql`INSERT INTO order_drafts (cycle_id, member_id, lines, updated_at)
      VALUES (${created.cycleId}, ${memberId}, ${JSON.stringify([{ productId: created.productIds[0], quantity: 2 }])}::jsonb, ${now})`;
    return created.cycleId;
  }

  const jobs = (cycleId: string) => sql`SELECT subscription_id, status, attempts, last_code FROM push_deliveries
    WHERE event_key LIKE ${`order_draft_reminder:${cycleId}:%`} ORDER BY subscription_id`;

  function deps(results: QueueOutcome[], extra: Partial<QueueDeps> = {}) {
    const queue = [...results];
    const send = vi.fn<QueueDeps["send"]>(async () => {
      const outcome = queue.shift() ?? "accepted";
      return { outcome, code: outcome === "accepted" ? 201 : outcome === "expired" ? 410 : null };
    });
    const value: QueueDeps = {
      send,
      topic: (key) => `topic-${key.length}`,
      payload: ({ cycleId, eventKey }) => ({ title: "Test", body: "Reminder", url: `/ordine?cycleId=${cycleId}`, tag: eventKey, schemaVersion: 1 }),
      sleep: async () => {},
      clock: () => now.getTime(),
      ...extra,
    };
    return { value, send };
  }

  it("WGR-03: books the account holder's devices, never a relative's, even with consent", async () => {
    const holderPhone = await device(scope.memberId, "holder");
    await device(relative, "relative");
    const cycleId = await cycleWithDraft("holder");
    await sendDraftReminders(getDb(), now);
    const booked = await jobs(cycleId);
    expect(booked.map((row) => row.subscription_id)).toEqual([holderPhone]);
    expect(booked[0].status).toBe("pending");
    const [row] = await sql`SELECT expires_at FROM push_deliveries WHERE subscription_id = ${holderPhone}`;
    expect(new Date(row.expires_at).getTime()).toBe(now.getTime() + 19 * 3_600_000);
  });

  it("WGR-04: two parallel runs reserve once and book one job per device", async () => {
    await device(scope.memberId, "parallel_a");
    await device(scope.memberId, "parallel_b");
    const cycleId = await cycleWithDraft("parallel");
    const [first, second] = await Promise.all([sendDraftReminders(getDb(), now), sendDraftReminders(getDb(), now)]);
    expect(first.sent + second.sent).toBe(1);
    expect(await sql`SELECT 1 FROM draft_reminders WHERE cycle_id = ${cycleId}`).toHaveLength(1);
    expect(await jobs(cycleId)).toHaveLength(2);
    expect(await sql`SELECT 1 FROM notifications WHERE type = 'order_draft_reminder' AND href = ${`/ordine?cycleId=${cycleId}`}`).toHaveLength(1);
  });

  it("WGR-05: a timeout then 201 ends accepted in the same run, with tag and TTL", async () => {
    const phone = await device(scope.memberId, "retry");
    const cycleId = await cycleWithDraft("retry");
    await sendDraftReminders(getDb(), now);
    const { value, send } = deps(["transient", "accepted"]);
    const result = await processPushQueue(getDb(), now, value);
    expect(result).toMatchObject({ claimed: 1, accepted: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    const [, payload, opts] = send.mock.calls[0];
    expect(payload.tag).toBe(draftReminderEventKey(cycleId, scope.memberId));
    // Expiry is the deadline (20 h away) minus the 60-minute margin.
    expect(opts.ttl).toBe(19 * 3_600);
    expect(await jobs(cycleId)).toEqual([expect.objectContaining({ subscription_id: phone, status: "accepted", attempts: 1, last_code: 201 })]);
    // Nothing left: a second pass only runs the claim.
    expect((await processPushQueue(getDb(), now, deps([]).value)).claimed).toBe(0);
  });

  it("WGR-05: transient three times goes back to pending in 5 minutes, then is retried", async () => {
    await device(scope.memberId, "later");
    const cycleId = await cycleWithDraft("later");
    await sendDraftReminders(getDb(), now);
    const first = deps(["transient", "transient", "transient"]);
    expect(await processPushQueue(getDb(), now, first.value)).toMatchObject({ retry: 1 });
    expect((await jobs(cycleId))[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect((await processPushQueue(getDb(), now, deps([]).value)).claimed).toBe(0);
    const later = new Date(now.getTime() + 5 * 60_000);
    expect(await processPushQueue(getDb(), later, deps(["accepted"]).value)).toMatchObject({ accepted: 1 });
  });

  it("WGR-05: the transport's rejected_host finalizes as rejected without retry", async () => {
    const phone = await device(scope.memberId, "blocked");
    const cycleId = await cycleWithDraft("blocked");
    await sendDraftReminders(getDb(), now);
    const provider = vi.fn();
    const send = vi.fn<QueueDeps["send"]>((target, payload, opts) =>
      sendPush({ ...target, endpoint: "https://excluded.example.test/synthetic" }, payload, { ...opts, env: {}, send: provider }));
    const { value } = deps([], { send });
    expect(await processPushQueue(getDb(), now, value)).toMatchObject({ failed: 1, retry: 0 });
    expect(await jobs(cycleId)).toEqual([expect.objectContaining({ subscription_id: phone, status: "rejected", attempts: 1 })]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
  });

  it("WGR-05: a crash after the claim is recovered once the lease expires", async () => {
    await device(scope.memberId, "crash");
    const cycleId = await cycleWithDraft("crash");
    await sendDraftReminders(getDb(), now);
    await sql`UPDATE push_deliveries SET status = 'sending', attempts = 1, claimed_at = ${now}
      WHERE event_key LIKE ${`order_draft_reminder:${cycleId}:%`}`;
    expect((await processPushQueue(getDb(), new Date(now.getTime() + 5 * 60_000), deps([]).value)).claimed).toBe(0);
    const result = await processPushQueue(getDb(), new Date(now.getTime() + 11 * 60_000), deps(["accepted"]).value);
    expect(result).toMatchObject({ claimed: 1, accepted: 1 });
    expect((await jobs(cycleId))[0]).toMatchObject({ status: "accepted", attempts: 2 });
  });

  it("WGR-05: a draft confirmed or a cycle closed before the attempt is skipped, nothing sent", async () => {
    await device(scope.memberId, "skip");
    const confirmed = await cycleWithDraft("confirmed");
    const closed = await cycleWithDraft("closed");
    await sendDraftReminders(getDb(), now);
    await sql`DELETE FROM order_drafts WHERE cycle_id = ${confirmed}`;
    await sql`UPDATE order_cycles SET status = 'closed' WHERE cycle_id = ${closed}`;
    const { value, send } = deps([]);
    expect(await processPushQueue(getDb(), now, value)).toMatchObject({ claimed: 2, skipped: 2 });
    expect(send).not.toHaveBeenCalled();
    expect((await jobs(confirmed))[0].status).toBe("skipped");
    expect((await jobs(closed))[0].status).toBe("skipped");
  });

  it("WGR-05: consent withdrawn after booking is skipped", async () => {
    await device(scope.memberId, "withdrawn");
    const cycleId = await cycleWithDraft("withdrawn");
    await sendDraftReminders(getDb(), now);
    await sql`UPDATE push_consents SET enabled = false WHERE person_id = ${scope.memberId}`;
    expect(await processPushQueue(getDb(), now, deps([]).value)).toMatchObject({ skipped: 1 });
    expect((await jobs(cycleId))[0].status).toBe("skipped");
  });

  it("expired (410) removes only that device; the other stays", async () => {
    const gone = await device(scope.memberId, "gone");
    const kept = await device(scope.memberId, "kept");
    const cycleId = await cycleWithDraft("expired");
    await sendDraftReminders(getDb(), now);
    const send = vi.fn<QueueDeps["send"]>(async (target) =>
      target.subscriptionId === gone ? { outcome: "expired", code: 410 } : { outcome: "accepted", code: 201 });
    await processPushQueue(getDb(), now, { ...deps([]).value, send });
    expect(await sql`SELECT subscription_id FROM push_subscriptions WHERE subscription_id IN (${gone}, ${kept})`)
      .toEqual([{ subscription_id: kept }]);
    expect(await jobs(cycleId)).toEqual([expect.objectContaining({ subscription_id: kept, status: "accepted" })]);
  });

  it("over the budget, jobs not started go back to pending, due now and uncounted", async () => {
    await device(scope.memberId, "budget_a");
    await device(scope.memberId, "budget_b");
    const cycleId = await cycleWithDraft("budget");
    await sendDraftReminders(getDb(), now);
    let time = now.getTime();
    const { value } = deps([], {
      concurrency: 1,
      budgetMs: 1_000,
      clock: () => time,
      send: async () => { time += 5_000; return { outcome: "accepted", code: 201 }; },
    });
    expect(await processPushQueue(getDb(), now, value)).toMatchObject({ accepted: 1, left: 1 });
    expect((await jobs(cycleId)).map((row) => [row.status, row.attempts]).sort()).toEqual([["accepted", 1], ["pending", 0]]);
  });

  it("a sender that throws never breaks the run (WGR-08)", async () => {
    await device(scope.memberId, "throws");
    const cycleId = await cycleWithDraft("throws");
    await sendDraftReminders(getDb(), now);
    const { value } = deps([], { send: async () => { throw new Error("boom"); } });
    expect(await processPushQueue(getDb(), now, value)).toMatchObject({ retry: 1 });
    expect((await jobs(cycleId))[0].status).toBe("pending");
    expect(await sql`SELECT 1 FROM notifications WHERE href = ${`/ordine?cycleId=${cycleId}`}`).toHaveLength(1);
  });

  it("the real wiring records simulated outside a live production deployment", async () => {
    await device(scope.memberId, "wired");
    const cycleId = await cycleWithDraft("wired");
    await sendDraftReminders(getDb(), now);
    expect(await runPushQueue(getDb(), now)).toMatchObject({ simulated: 1 });
    expect((await jobs(cycleId))[0].status).toBe("simulated");
  });

  it("cleanup drops old jobs and the devices of deactivated people (DEV-05)", async () => {
    const leaving = await scope.createExtraMember("leaving");
    const phone = await device(leaving, "leaving");
    await sql`UPDATE members SET active = false WHERE member_id = ${leaving}`;
    await cleanPushQueue(getDb(), now);
    expect(await sql`SELECT 1 FROM push_subscriptions WHERE subscription_id = ${phone}`).toHaveLength(0);
  });
});
