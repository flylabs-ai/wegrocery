import { describe, expect, it } from "vitest";
import { deviceState, reconciledState, type DeviceEnv } from "./device-client";

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
