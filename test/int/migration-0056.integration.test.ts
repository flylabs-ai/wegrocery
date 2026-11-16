import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { describeDb, runSql, testSql } from "./fixtures";

// drizzle/0056_stripe_events.sql on a real database: it applies again, has the
// kit's columns, and the rollback file undoes it.
describeDb("migration 0056 (stripe events register)", () => {
  const apply = (file: string) => runSql(readFileSync(file, "utf8"));
  const columns = async () =>
    (await testSql`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stripe_events' ORDER BY ordinal_position`).map((r) => r.column_name);

  it("applies again with the kit's columns", async () => {
    await apply("drizzle/0056_stripe_events.sql");
    expect(await columns()).toEqual(["id", "type", "received_at", "processed_at", "error"]);
  });

  it("has a rollback that drops the table", async () => {
    await apply("drizzle/0056_stripe_events_down.sql");
    expect(await columns()).toEqual([]);
    await apply("drizzle/0056_stripe_events.sql");
    expect(await columns()).toHaveLength(5);
  });
});
