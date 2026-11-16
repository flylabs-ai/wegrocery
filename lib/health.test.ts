import { afterEach, describe, expect, it, vi } from "vitest";
import { appCommit, checkHealth, healthResponse } from "./health";

afterEach(() => vi.useRealTimers());

describe("checkHealth", () => {
  it("is ok when the database answers", async () => {
    expect(await checkHealth(() => Promise.resolve([{ "?column?": 1 }]), "1.2.0")).toEqual({ ok: true, version: "1.2.0", db: true });
  });

  it("is not ok when the database refuses, without the error's text", async () => {
    const health = await checkHealth(() => Promise.reject(new Error("password authentication failed")), "1.2.0");
    expect(health).toEqual({ ok: false, version: "1.2.0", db: false });
  });

  it("is not ok when the database hangs past the timeout", async () => {
    expect((await checkHealth(() => new Promise(() => {}), "1.2.0", 20)).db).toBe(false);
  });
  it("keeps each app's JSON byte for byte, with commit only when supplied", async () => {
    const probe = async () => {};
    const wg = healthResponse(await checkHealth(probe, { version: "1.2.0" }));
    expect(await wg.text()).toBe('{"ok":true,"version":"1.2.0","db":true}');
    const stellar = healthResponse(await checkHealth(probe, { version: "0.1.0", commit: appCommit({ VERCEL_GIT_COMMIT_SHA: "abcdef012345" }) }));
    expect(await stellar.text()).toBe('{"ok":true,"version":"0.1.0","commit":"abcdef0","db":true}');
    expect(wg.status).toBe(200);
    expect(wg.headers.get("cache-control")).toBe("no-store");
    expect(appCommit({})).toBe("local");
    expect(appCommit({ VERCEL_GIT_COMMIT_SHA: "" })).toBe("local");
  });
  it("returns 503 on a hung or synchronously failing database without error text", async () => {
    vi.useFakeTimers();
    const pending = checkHealth(() => new Promise<never>(() => {}), { version: "1.2.0", timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    const response = healthResponse(await pending);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, version: "1.2.0", db: false });
    expect(await checkHealth(() => { throw new Error("synthetic-private-error"); }, { version: "1.2.0" })).toEqual({ ok: false, version: "1.2.0", db: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
