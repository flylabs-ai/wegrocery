import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { describeDb, makeScope, rawClient, testSql as sql } from "./fixtures";

const up = "drizzle/0057_push_subscriptions.sql";
const down = "drizzle/0057_push_subscriptions_down.sql";

async function apply(file: string) {
  const statements = readFileSync(file, "utf8").split(/;\s*(?:\n|$)/).filter((statement) => statement.trim());
  await rawClient().transaction((tx) => statements.map((statement) => tx.query(statement)));
}

describeDb("migration 0057 (push subscriptions)", () => {
  const scope = makeScope("push_migration");
  const subscriptionId = scope.id("subscription");
  const endpoint = `https://push.example.invalid/${subscriptionId}`;
  const eventKey = `order_draft_reminder:${scope.id("cycle")}:${scope.memberId}`;

  beforeAll(() => scope.createMember());
  afterAll(() => scope.cleanup());

  it("rolls back, applies from scratch and reapplies without losing rows", async () => {
    const tables = () => sql`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('push_subscriptions', 'push_consents', 'push_deliveries')
      ORDER BY table_name`;

    try {
      await apply(down);
      expect(await tables()).toEqual([]);
      await apply(up);
      expect((await tables()).map((row) => row.table_name)).toEqual([
        "push_consents", "push_deliveries", "push_subscriptions",
      ]);
      const indexes = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname IN ('push_subscriptions_person_idx', 'push_deliveries_due_idx')
        ORDER BY indexname`;
      expect(indexes.map((row) => row.indexname)).toEqual([
        "push_deliveries_due_idx", "push_subscriptions_person_idx",
      ]);

      await sql`INSERT INTO push_subscriptions (subscription_id, person_id, endpoint, p256dh, auth)
        VALUES (${subscriptionId}, ${scope.memberId}, ${endpoint}, ${"A".repeat(87)}, ${"B".repeat(22)})`;
      await apply(up);
      expect(await sql`SELECT endpoint FROM push_subscriptions WHERE subscription_id = ${subscriptionId}`)
        .toEqual([{ endpoint }]);
    } finally {
      await apply(up);
    }
  });

  it.each([
    ["non-HTTPS endpoint", "http://push.example.invalid", 87, 22],
    ["short p256dh", "https://push.example.invalid/short-p256dh", 79, 22],
    ["long p256dh", "https://push.example.invalid/long-p256dh", 101, 22],
    ["short auth", "https://push.example.invalid/short-auth", 87, 15],
    ["long auth", "https://push.example.invalid/long-auth", 87, 31],
  ])("rejects a %s", async (_label, invalidEndpoint, p256dhLength, authLength) => {
    await expect(sql`INSERT INTO push_subscriptions (subscription_id, person_id, endpoint, p256dh, auth)
      VALUES (${scope.id("invalid")}, ${scope.memberId}, ${invalidEndpoint},
        ${"A".repeat(p256dhLength)}, ${"B".repeat(authLength)})`).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects delivery statuses outside the allowed values", async () => {
    await expect(sql`INSERT INTO push_deliveries (event_key, subscription_id, status, expires_at)
      VALUES (${eventKey}, ${subscriptionId}, 'unknown', now())`).rejects.toMatchObject({ code: "23514" });
  });

  it("cascades member deletion to subscriptions, consents and deliveries", async () => {
    await sql`INSERT INTO push_consents (person_id, category) VALUES (${scope.memberId}, 'order_draft_reminder')`;
    await sql`INSERT INTO push_deliveries (event_key, subscription_id, expires_at)
      VALUES (${eventKey}, ${subscriptionId}, now())`;

    await sql`DELETE FROM members WHERE member_id = ${scope.memberId}`;

    expect(await sql`SELECT 1 FROM push_subscriptions WHERE subscription_id = ${subscriptionId}`).toEqual([]);
    expect(await sql`SELECT 1 FROM push_consents WHERE person_id = ${scope.memberId}`).toEqual([]);
    expect(await sql`SELECT 1 FROM push_deliveries WHERE subscription_id = ${subscriptionId}`).toEqual([]);
  });
});
