import { describe, expect, it } from "vitest";
import { autoOpenEnabled } from "./cron-auth";

const SECRET = "s".repeat(40);

describe("autoOpenEnabled", () => {
  it("needs a long enough CRON_SECRET", () => {
    expect(autoOpenEnabled({ CRON_SECRET: SECRET })).toBe(true);
    expect(autoOpenEnabled({ CRON_SECRET: "short" })).toBe(false);
    expect(autoOpenEnabled({})).toBe(false);
  });
});
