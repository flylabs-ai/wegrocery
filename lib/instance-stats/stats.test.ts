import { describe, expect, it } from "vitest";
import { assertSafeStats, notFound, statsResponse } from "./stats";
import { STELLAR_STATS, STELLAR_STATS_JSON, WG_STATS, WG_STATS_JSON, WG_CONFIG_IDS } from "./fixtures.test.data";

describe("stats response helpers", () => {
  it.each([[WG_STATS, WG_STATS_JSON], [STELLAR_STATS, STELLAR_STATS_JSON]] as const)("preserves the app's response bytes and no-store", async (stats, expected) => {
    const response = statsResponse(stats);
    expect(await response.text()).toBe(expected);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("uses one plain 404 for every refusal", async () => {
    const response = notFound();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
describe("assertSafeStats", () => {
  it("keeps the actual WeGrocery camelCase configuration IDs unchanged", async () => {
    expect(WG_CONFIG_IDS).toContain("signIn");
    expect(WG_CONFIG_IDS).toContain("firstAdmin");
    expect(WG_CONFIG_IDS).toContain("authSecret");
    expect(WG_CONFIG_IDS).toContain("baseUrl");
    expect(WG_CONFIG_IDS).toContain("dbRole");
    expect(WG_CONFIG_IDS).toContain("autoOpen");
    expect(() => assertSafeStats(WG_STATS)).not.toThrow();
    const body = await statsResponse(WG_STATS).json();
    expect(body.config.map((item: { id: string }) => item.id)).toEqual(WG_CONFIG_IDS);
  });
  it.each([
    { counts: { members: 1.5 } }, { counts: { members: -1 } }, { counts: { active_members: 1 } },
    { config: [{ id: "Bad ID", status: "ok" }] }, { config: [{ id: "email", status: "unknown" }] },
    { config: [{ id: "1invalid", status: "ok" }] }, { config: [{ id: "_invalid", status: "ok" }] },
    { config: new Array(1) }, { pendingMigrations: new Array(1) },
    { extra: { nested: ["hidden member@example.com"] } }, { "owner@example.test": "hidden key" },
    { extra: Number.NaN }, { extra: () => "not JSON" },
  ])("rejects unsafe data without echoing it: %j", (unsafe) => {
    expect(() => assertSafeStats({ ...WG_STATS, ...unsafe })).toThrow("Unsafe instance stats");
  });
  it("accepts arbitrary JSON app fields and valid configuration IDs", () => {
    expect(() => assertSafeStats({ ...STELLAR_STATS, config: [{ id: "auth.email_otp-v1", status: "off" }], extra: { nested: [true, null, 1.5, "example"] } })).not.toThrow();
    expect(() => assertSafeStats({ ...STELLAR_STATS, config: [{ id: "Auth.email_OTP-v1", status: "ok" }] })).not.toThrow();
  });
  it("refuses cycles and keeps unsafe responses from being serialized", () => {
    const circular: { next?: unknown } = {}; circular.next = circular;
    expect(() => assertSafeStats({ ...WG_STATS, extra: circular })).toThrow("Unsafe instance stats");
    expect(() => statsResponse({ ...WG_STATS, extra: "member@example.com" })).toThrow();
  });
});
