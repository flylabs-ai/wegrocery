import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceState, reconciledState, subscribeDevice, type DeviceEnv } from "./device-client";

const desktop: DeviceEnv = { hasServiceWorker: true, hasPush: true, permission: "default", userAgent: "Mozilla/5.0 (Macintosh) Chrome/141.0", standalone: false };

describe("deviceState (DEV-01)", () => {
  it("asks iOS outside the Home Screen to install first", () => {
    expect(deviceState({ ...desktop, userAgent: "Mozilla/5.0 (iPhone) Mobile/15E148" }, false)).toBe("ios");
    expect(deviceState({ ...desktop, userAgent: "Mozilla/5.0 (iPhone) Mobile/15E148", standalone: true, permission: "granted" }, true)).toBe("on");
  });

  it("covers unsupported, denied, off and on", () => {
    expect(deviceState({ ...desktop, hasPush: false }, false)).toBe("unsupported");
    expect(deviceState({ ...desktop, permission: "denied" }, true)).toBe("denied");
    expect(deviceState(desktop, false)).toBe("off");
    expect(deviceState({ ...desktop, permission: "granted" }, true)).toBe("on");
  });
});

describe("reconciledState (DEV-02/03)", () => {
  it("is on only when the server says mine", () => {
    expect(reconciledState("on", "mine")).toBe("on");
    expect(reconciledState("on", "none")).toBe("incomplete");
    expect(reconciledState("on", "other")).toBe("off");
    expect(reconciledState("on", null)).toBe("off");
    expect(reconciledState("denied", "mine")).toBe("denied");
  });
});

describe("subscribeDevice (DEV-01)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests permission and subscribes with the existing root worker", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const subscription = { endpoint: "https://example.test/synthetic" };
    const subscribe = vi.fn().mockResolvedValue({ toJSON: () => subscription });
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Notification", { requestPermission });
    vi.stubGlobal("navigator", { serviceWorker: {
      register,
      ready: Promise.resolve({ pushManager: { getSubscription: async () => null, subscribe } }),
    } });

    await expect(subscribeDevice("AQ")).resolves.toEqual({ subscription });
    expect(requestPermission).toHaveBeenCalledBefore(register);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1]) });
  });

  it("shows denial without registering or subscribing", async () => {
    const register = vi.fn();
    vi.stubGlobal("Notification", { requestPermission: async () => "denied" });
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    await expect(subscribeDevice("AQ")).resolves.toEqual({ state: "denied" });
    expect(register).not.toHaveBeenCalled();
  });
});
