import { describe, expect, it } from "vitest";
import { deadlineNotice } from "./deadline-change";

// Rome is UTC+1 from the last Sunday of October 2026.
const NOW = new Date("2026-11-26T06:10:00.000Z");
const SAT_19 = new Date("2026-11-28T18:00:00.000Z"); // Sat 28 Nov 19:00 in Rome
const SAT_12 = new Date("2026-11-28T11:00:00.000Z"); // Sat 28 Nov 12:00 in Rome

describe("deadlineNotice", () => {
  it("says an earlier close is earlier, with the new deadline and the old one", () => {
    const notice = deadlineNotice("Verdura", SAT_19, SAT_12, NOW);
    expect(notice?.title).toBe("Earlier deadline: Verdura");
    expect(notice?.body).toMatch(/until Saturday 28 Nov, 12:00 \(was Saturday 28 Nov, 19:00\)/);
  });

  it("says a later close is later", () => {
    expect(deadlineNotice("Verdura", SAT_12, SAT_19, NOW)?.title).toBe("Later deadline: Verdura");
  });

  it("is null when the deadline reads the same", () => {
    expect(deadlineNotice("Verdura", SAT_12, new Date(SAT_12.getTime() + 1000), NOW)).toBeNull();
  });

  it("is null without a deadline or when the new one has passed", () => {
    expect(deadlineNotice("Verdura", null, SAT_12, NOW)).toBeNull();
    expect(deadlineNotice("Verdura", SAT_12, null, NOW)).toBeNull();
    expect(deadlineNotice("Verdura", SAT_12, new Date(NOW.getTime() - 60_000), NOW)).toBeNull();
  });
});
