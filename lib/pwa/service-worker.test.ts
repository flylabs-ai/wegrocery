import { readFileSync } from "node:fs";
import { MessageChannel } from "node:worker_threads";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://wegrocery.invalid";
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const core = readFileSync(new URL("../../public/sw-core.js", import.meta.url), "utf8");
type WorkerEvent = {
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
  data?: { json: () => unknown; text: () => never };
  notification?: { data?: { url: string }; close: () => void };
  request?: Pick<Request, "mode" | "method" | "url">;
};

function loadWorker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const names = new Set(["offline-v0", "offline-v1", "offline-v9", "other-cache"]);
  const offline = new Response("You are offline");
  const cache = { add: vi.fn<(request: Request) => Promise<void>>().mockResolvedValue(undefined), match: vi.fn(async () => offline) };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [...names]),
    delete: vi.fn(async (name: string) => names.delete(name)),
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handle: (event: WorkerEvent) => void) => {
      expect(listeners.has(type)).toBe(false);
      listeners.set(type, handle);
    },
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn<() => Promise<ReturnType<typeof windowClient>[]>>().mockResolvedValue([]),
      openWindow: vi.fn(async () => {}),
    },
    navigator: { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) },
    registration: { showNotification: vi.fn(async () => {}) },
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  const setTimer = vi.fn(setTimeout);
  const context = createContext({
    self, caches, fetch, Request, Response, URL, MessageChannel, setTimeout: setTimer, clearTimeout,
    importScripts(path: string) {
      expect(path).toBe("/sw-core.js");
      runInContext(core, context);
    },
  });
  runInContext(worker, context);
  function dispatch(type: string, event: WorkerEvent = {}) {
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const respondWith = vi.fn<(promise: Promise<Response>) => void>();
    listeners.get(type)!({ ...event, waitUntil, respondWith });
    return { waitUntil, respondWith };
  }
  return { self, caches, names, cache, fetch, offline, dispatch, setTimer };
}

function windowClient(path: string) {
  return {
    url: new URL(path, ORIGIN).href,
    focus: vi.fn(async () => {}),
    navigate: vi.fn(),
    postMessage: vi.fn<(message: unknown, ports?: [MessageChannel["port2"]]) => void>()
      .mockImplementation((_message, ports) => ports?.[0].close()),
  };
}

const notice = { title: "Test cycle", body: "Test notification", url: "/impostazioni" };
const fallback = { title: "WeGrocery", body: "You have a new notification", url: "/" };

describe("push", () => {
  it.each([
    ["v0", notice, notice],
    ["v1", { ...notice, schemaVersion: 1, eventId: "test-event", badge: 4, tag: "test-tag" }, notice],
    ["extra fields", { ...notice, extra: "ignored" }, notice],
    ["wrong optional types", { ...notice, badge: "4", tag: [], schemaVersion: {}, eventId: 4 }, notice],
    ["no data", undefined, fallback],
    ["null", null, fallback],
    ["other JSON type", 7, fallback],
    ["missing fields", { body: notice.body, url: notice.url }, fallback],
    ["wrong required type", { ...notice, body: {} }, fallback],
    ["negative badge", { ...notice, badge: -1 }, notice],
    ["fractional badge", { ...notice, badge: 2.5 }, notice],
    ["unsafe destination", { ...notice, url: "//elsewhere.invalid/" }, fallback],
    ["backslash", { ...notice, url: "/a\\b" }, fallback],
    ["control character", { ...notice, url: "/\t/a" }, fallback],
    ["malformed URL", { ...notice, url: "//[" }, fallback],
    ["broken JSON", new SyntaxError("invalid JSON"), fallback],
  ])("shows exactly one notification for %s", async (_label, payload, expected) => {
    const { dispatch, self } = loadWorker();
    const text = vi.fn((): never => { throw new Error("Unexpected read of raw payload"); });
    const data = payload === undefined ? undefined : {
      json: () => {
        if (payload instanceof SyntaxError) throw payload;
        return payload;
      },
      text,
    };
    const { waitUntil } = dispatch("push", { data });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    const v1 = _label === "v1";
    expect(text).not.toHaveBeenCalled();
    expect(self.registration.showNotification).toHaveBeenCalledExactlyOnceWith(expected.title, {
      body: expected.body,
      data: { url: expected.url },
      tag: v1 ? "test-tag" : undefined,
      icon: "/icons/192.png",
      badge: "/icons/192.png",
    });
    if (v1) expect(self.navigator.setAppBadge).toHaveBeenCalledExactlyOnceWith(4);
    else expect(self.navigator.clearAppBadge).toHaveBeenCalledOnce();
  });

  it("clears a zero badge and shows the notice even if badging fails", async () => {
    const { dispatch, self } = loadWorker();
    self.navigator.clearAppBadge.mockRejectedValueOnce(new Error("unavailable"));
    const { waitUntil } = dispatch("push", {
      data: { json: () => ({ ...notice, badge: 0 }), text: () => { throw new Error("unexpected"); } },
    });
    await waitUntil.mock.calls[0][0];
    expect(self.navigator.clearAppBadge).toHaveBeenCalledOnce();
    expect(self.registration.showNotification).toHaveBeenCalledOnce();
  });
});

describe("notificationclick", () => {
  async function click(state: ReturnType<typeof loadWorker>, url: string) {
    const close = vi.fn();
    await state.dispatch("notificationclick", { notification: { data: { url }, close } }).waitUntil.mock.calls[0][0];
    expect(close).toHaveBeenCalledOnce();
    expect(state.self.clients.matchAll).toHaveBeenCalledExactlyOnceWith({ type: "window" });
    for (const client of await state.self.clients.matchAll.mock.results[0].value) {
      expect(client.navigate).not.toHaveBeenCalled();
    }
  }

  it("focuses the exact match even when another window was focused more recently", async () => {
    const state = loadWorker();
    const recent = windowClient("/");
    const matching = windowClient("/impostazioni");
    state.self.clients.matchAll.mockResolvedValue([recent, matching]);
    await click(state, "/impostazioni");
    expect(matching.focus).toHaveBeenCalledOnce();
    expect(recent.postMessage).not.toHaveBeenCalled();
    expect(matching.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "flylabs:push-opened" });
    expect(state.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("sends the path to the most recently focused window and waits for handled", async () => {
    const state = loadWorker();
    const recent = windowClient("/");
    const older = windowClient("/voce");
    recent.postMessage.mockImplementation((_message, ports) => {
      const port = ports?.[0];
      port?.postMessage("handled");
      port?.close();
    });
    state.self.clients.matchAll.mockResolvedValue([recent, older]);
    await click(state, "/impostazioni");
    expect(recent.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "flylabs:open", url: "/impostazioni" }, [expect.anything()],
    );
    expect(recent.focus).toHaveBeenCalledOnce();
    expect(older.postMessage).not.toHaveBeenCalled();
    expect(state.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window after one second without a handled acknowledgement", async () => {
    const state = loadWorker();
    const oldPage = windowClient("/");
    state.self.clients.matchAll.mockResolvedValue([oldPage]);
    state.setTimer.mockImplementation((callback) => setTimeout(callback, 0));
    await click(state, "/impostazioni");
    expect(state.setTimer).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 1000);
    expect(oldPage.focus).not.toHaveBeenCalled();
    expect(state.self.clients.openWindow).toHaveBeenCalledExactlyOnceWith(ORIGIN + "/impostazioni?_push_open=1");
  });

  it("opens a new window with a safe destination when there are no windows", async () => {
    const state = loadWorker();
    await click(state, "//elsewhere.invalid/");
    expect(state.self.clients.openWindow).toHaveBeenCalledExactlyOnceWith(ORIGIN + "/?_push_open=1");
  });
});

describe("offline", () => {
  it("precaches only the public standalone offline document before skipWaiting", async () => {
    const { dispatch, cache, caches, self } = loadWorker();
    await dispatch("install").waitUntil.mock.calls[0][0];
    expect(caches.open).toHaveBeenCalledExactlyOnceWith("offline-v1");
    expect(cache.add).toHaveBeenCalledOnce();
    expect(cache.add.mock.lastCall?.[0]).toMatchObject({
      url: ORIGIN + "/offline", redirect: "error",
    });
    expect(cache.add.mock.invocationCallOrder[0]).toBeLessThan(self.skipWaiting.mock.invocationCallOrder[0]);
  });

  it("removes older offline caches and claims clients", async () => {
    const { dispatch, names, self } = loadWorker();
    await dispatch("activate").waitUntil.mock.calls[0][0];
    expect([...names]).toEqual(["offline-v1", "other-cache"]);
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });

  it.each([200, 404, 500])("passes through the original HTTP %i response", async (status) => {
    const { dispatch, fetch, caches } = loadWorker();
    const response = new Response(null, { status });
    const request = { method: "GET", mode: "navigate" as const, url: ORIGIN + "/voce" };
    fetch.mockResolvedValueOnce(response);
    await expect(dispatch("fetch", { request }).respondWith.mock.calls[0][0]).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
    expect(caches.open).not.toHaveBeenCalled();
  });

  it("uses only the offline document when navigation fetch rejects", async () => {
    const { dispatch, fetch, cache, offline } = loadWorker();
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    const request = { method: "GET", mode: "navigate" as const, url: ORIGIN + "/voce" };
    await expect(dispatch("fetch", { request }).respondWith.mock.calls[0][0]).resolves.toBe(offline);
    expect(cache.match).toHaveBeenCalledExactlyOnceWith("/offline");
  });

  it.each([
    ["GET", "cors", ORIGIN + "/voce?_rsc=fixture"],
    ["POST", "navigate", ORIGIN + "/voce"],
    ["POST", "cors", ORIGIN + "/voce"],
    ["GET", "navigate", ORIGIN + "/api"],
    ["GET", "navigate", ORIGIN + "/api/auth/session"],
    ["GET", "navigate", "https://elsewhere.invalid/"],
    ["GET", "no-cors", ORIGIN + "/fixture.png"],
  ] satisfies [string, RequestMode, string][])("ignores %s %s %s", (method, mode, url) => {
    const { dispatch, caches, fetch } = loadWorker();
    expect(dispatch("fetch", { request: { method, mode, url } }).respondWith).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
