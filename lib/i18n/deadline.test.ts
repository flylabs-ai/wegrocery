import { describe, expect, test } from "vitest";
import { deadlineParts, formatDeadline, formatDeadlineLong, formatPickupLong, formatPickupSlot, formatPickups, formatPickupsLong } from "./deadline";

// Rome is UTC+2 until the last Sunday of October 2026.
const MONDAY_MIDNIGHT = "2026-10-12T22:00:00.000Z"; // Tue 13 Oct 00:00 in Rome

describe("formatDeadline", () => {
  test("a close at 00:00 reads as 23:59 of the day before, with the weekday", () => {
    const s = formatDeadline(MONDAY_MIDNIGHT);
    expect(s).toMatch(/Mon/);
    expect(s).toMatch(/12 Oct/);
    expect(s).toMatch(/23:59/);
  });

  test("any other time is shown as stored", () => {
    const s = formatDeadline("2026-10-12T18:30:00.000Z"); // 20:30 in Rome
    expect(s).toBe("Mon 12 Oct · 20:30");
  });
});


describe("pickups", () => {
  test("a pickup at midnight has no time", () => {
    expect(formatPickupSlot("2026-10-14T22:00:00.000Z", null)).toMatch(/^Thu 15 Oct$/);
  });

  test("a pickup with hours shows the range", () => {
    expect(formatPickupSlot("2026-10-14T16:00:00.000Z", "20:00")).toMatch(/^Wed 14 Oct · 18:00–20:00$/);
  });

  test("two pickups with the same hours share one line", () => {
    const lines = formatPickups(
      { date: "2026-10-14T16:00:00.000Z", endTime: "20:00" },
      { date: "2026-10-15T16:00:00.000Z", endTime: "20:00" },
    );
    expect(lines).toEqual(["Wed 14 and Thu 15 Oct · 18:00–20:00"]);
  });

  test("two pickups with different hours keep a line each", () => {
    const lines = formatPickups(
      { date: "2026-10-14T16:00:00.000Z", endTime: "20:00" },
      { date: "2026-10-15T07:00:00.000Z", endTime: "11:00" },
    );
    expect(lines).toHaveLength(2);
  });
});

describe("long forms for Home", () => {
  test("a midnight deadline reads as 23:59 of the day before, with the weekday in full", () => {
    expect(deadlineParts(MONDAY_MIDNIGHT)).toEqual({ day: expect.stringMatching(/^Monday.*12 Oct$/), time: "23:59" });
  });

  test("a pickup with its hours, or the day alone at midnight", () => {
    expect(formatPickupLong("2026-10-14T16:00:00.000Z", "20:00")).toMatch(/Wednesday.*14 Oct, 18:00–20:00/);
    expect(formatPickupLong(MONDAY_MIDNIGHT, null)).toMatch(/^Tuesday.*13 Oct$/);
  });
});

describe("the same words everywhere a member reads them", () => {
  test("the deadline in a sentence, also at midnight", () => {
    expect(formatDeadlineLong("2026-11-28T11:00:00.000Z")).toBe("Saturday 28 Nov, 12:00");
    expect(formatDeadlineLong(MONDAY_MIDNIGHT)).toBe("Monday 12 Oct, 23:59");
  });

  test("two pickups with the same hours read as one line", () => {
    const lines = formatPickupsLong(
      { date: "2026-12-09T17:30:00.000Z", endTime: "20:30" },
      { date: "2026-12-10T17:30:00.000Z", endTime: "20:30" },
    );
    expect(lines).toEqual(["Wednesday 9 and Thursday 10 Dec, 18:30–20:30"]);
  });

  test("across two months each day keeps its month", () => {
    const lines = formatPickupsLong(
      { date: "2026-11-30T17:30:00.000Z", endTime: null },
      { date: "2026-12-01T17:30:00.000Z", endTime: null },
    );
    expect(lines).toEqual(["Monday 30 Nov and Tuesday 1 Dec, 18:30"]);
  });

  test("days with no hours share a line, different hours keep a line each", () => {
    expect(formatPickupsLong({ date: MONDAY_MIDNIGHT, endTime: null }, { date: "2026-10-13T22:00:00.000Z", endTime: null }))
      .toEqual(["Tuesday 13 and Wednesday 14 Oct"]);
    expect(formatPickupsLong({ date: "2026-10-14T16:00:00.000Z", endTime: "20:00" }, { date: "2026-10-15T07:00:00.000Z", endTime: "11:00" }))
      .toHaveLength(2);
    expect(formatPickupsLong(null, null)).toEqual([]);
  });
});
