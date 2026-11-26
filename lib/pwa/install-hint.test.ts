import { describe, expect, it } from "vitest";
import { installHint, isIOS, isPhoneOrTablet, type InstallContext } from "./install-hint";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const android = "Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36";
const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36";
const context = (overrides: Partial<InstallContext>): InstallContext => ({ userAgent: android, maxTouchPoints: 5, standalone: false, dismissed: false, canPrompt: false, ...overrides });
describe("WeGrocery install-hint parity", () => {
  it("offers a native prompt only when available on mobile", () => {
    expect(installHint(context({ canPrompt: true }))).toBe("prompt");
    expect(installHint(context({}))).toBeNull();
    expect(installHint(context({ userAgent: "Android Firefox/130.0" }))).toBeNull();
  });
  it("recognizes iPhone, iPad and desktop-UA iPadOS", () => {
    for (const userAgent of [iphone, "iPad", "iPod", ipad]) expect(installHint(context({ userAgent }))).toBe("ios");
    expect(isIOS(ipad, 0)).toBe(false);
    expect(isPhoneOrTablet(desktop, 0)).toBe(false);
  });
  it("stays silent on desktop, when installed or dismissed", () => {
    for (const overrides of [{ userAgent: desktop, maxTouchPoints: 0, canPrompt: true }, { userAgent: ipad, maxTouchPoints: 0 }, { userAgent: iphone, standalone: true }, { canPrompt: true, dismissed: true }]) expect(installHint(context(overrides))).toBeNull();
  });
});
