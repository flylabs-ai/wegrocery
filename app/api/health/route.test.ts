import { afterEach, expect, it, vi } from "vitest";
import { getPushTotalsToday } from "@/lib/usage/events";
import { GET } from "./route";

vi.mock("@/lib/db/client", () => ({ getDb: () => ({ execute: async () => ({ rows: [] }) }) }));
vi.mock("@/lib/usage/events", () => ({ getPushTotalsToday: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

it("reports only the push state and aggregate counts alongside liveness", async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "synthetic-public-value");
  vi.stubEnv("VAPID_PRIVATE_KEY", "synthetic-private-value");
  vi.stubEnv("VAPID_SUBJECT", "mailto:ops@example.test");
  vi.stubEnv("PUSH_PILOT_MEMBER_IDS", "test-person");
  vi.mocked(getPushTotalsToday).mockResolvedValue({ push_accepted: 3 });

  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    ok: true, db: true, version: expect.any(String), push: "misconfigured", pushToday: { push_accepted: 3 },
  });
});

it("preserves liveness when the optional totals query fails", async () => {
  vi.mocked(getPushTotalsToday).mockRejectedValueOnce(new Error("totals unavailable"));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, pushToday: {} });
});
