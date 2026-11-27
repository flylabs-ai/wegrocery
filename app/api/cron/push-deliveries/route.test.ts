import { beforeEach, describe, expect, it, vi } from "vitest";

const processPushQueue = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/push/queue", () => ({ processPushQueue, cleanPushQueue: vi.fn() }));
vi.mock("@/lib/push/transport", () => ({ sendPush: vi.fn(), pushTopic: vi.fn() }));
vi.mock("@/lib/push/payload", () => ({ draftReminderPayload: vi.fn() }));
vi.mock("@/lib/usage/events", () => ({ recordUsageBatch: vi.fn() }));

const { GET } = await import("./route");
const SECRET = "s".repeat(40);
const call = (auth?: string) => GET(new Request("https://app.example.invalid/api/cron/push-deliveries", {
  headers: auth ? { authorization: auth } : {},
}));

describe("/api/cron/push-deliveries", () => {
  beforeEach(() => {
    processPushQueue.mockReset();
    vi.stubEnv("CRON_SECRET", SECRET);
  });

  it("answers 404 without the cron secret and runs nothing", async () => {
    expect((await call()).status).toBe(404);
    expect((await call("Bearer wrong")).status).toBe(404);
    expect(processPushQueue).not.toHaveBeenCalled();
  });

  it("runs one pass and returns counts only", async () => {
    processPushQueue.mockResolvedValue({ claimed: 2, accepted: 1, simulated: 0, skipped: 1, retry: 0, failed: 0, left: 0 });
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 2, accepted: 1, simulated: 0, skipped: 1, retry: 0, failed: 0, left: 0 });
  });

  it("answers 200 when the queue throws (WGR-08)", async () => {
    processPushQueue.mockRejectedValue(new Error("transport down"));
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false });
  });
});
