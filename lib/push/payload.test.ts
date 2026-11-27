import { expect, it, vi } from "vitest";
import { formatDeadlineLong } from "@/lib/i18n/deadline";
import { draftReminderPayload, serializePushPayload } from "./payload";

vi.mock("@/lib/brand/get-brand", () => ({
  getBrand: async () => ({ shortName: "Test Co-op" }),
}));

it("includes the installed brand, formatted deadline and only the allowed fields", async () => {
  const closeAt = "2026-11-28T11:00:00.000Z";
  const payload = await draftReminderPayload({ cycleId: "test cycle", closeAt, eventKey: "test-event" });
  expect(payload).toEqual({
    title: "Test Co-op",
    body: expect.stringContaining(formatDeadlineLong(closeAt)),
    url: "/ordine?cycleId=test+cycle",
    tag: "test-event",
    schemaVersion: 1,
  });
  expect(Buffer.byteLength(serializePushPayload(payload))).toBeLessThanOrEqual(3072);
});
