import { afterEach, expect, it, vi } from "vitest";
import { removePushDeviceAction } from "@/lib/actions/push-devices";
import { signOutWithDevice } from "./logout-client";

vi.mock("@/lib/actions/push-devices", () => ({
  removePushDeviceAction: vi.fn(() => new Promise(() => {})),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("signs out after a bounded wait when the unbind action never responds", async () => {
  vi.useFakeTimers();
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);
  const signOut = vi.fn().mockResolvedValue(undefined);
  const endpoint = "https://push.example.invalid/test";
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ endpoint, unsubscribe }) },
      }),
    },
    clearAppBadge,
  });

  const logout = signOutWithDevice(signOut);
  await vi.advanceTimersByTimeAsync(0);
  expect(removePushDeviceAction).toHaveBeenCalledWith(endpoint);
  expect(signOut).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  await logout;

  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(clearAppBadge).toHaveBeenCalledOnce();
  expect(signOut).toHaveBeenCalledOnce();
});

it("also signs out if the browser never returns its registration", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: () => new Promise(() => {}) },
  });
  const signOut = vi.fn().mockResolvedValue(undefined);
  const logout = signOutWithDevice(signOut);
  await vi.advanceTimersByTimeAsync(4000);
  await logout;
  expect(signOut).toHaveBeenCalledOnce();
});
