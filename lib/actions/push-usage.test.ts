import { beforeEach, expect, it, vi } from "vitest";
import { ActionError } from "@/lib/action-error";
import { requireActiveMember } from "@/lib/auth/session";
import { recordUsage } from "@/lib/usage/events";
import { recordPushClientUsage } from "./push-usage";

vi.mock("@/lib/auth/session", () => ({ requireActiveMember: vi.fn() }));
vi.mock("@/lib/usage/events", () => ({ recordUsage: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it("only records explicitly allowed events from authenticated members", async () => {
  for (const event of ["push_accepted", "push_device_on", "login", "test-person", {}]) {
    await recordPushClientUsage(event);
  }
  expect(requireActiveMember).not.toHaveBeenCalled();
  expect(recordUsage).not.toHaveBeenCalled();

  // A visitor who is not signed in (the bridge runs on /login too): nothing recorded, nothing thrown.
  vi.mocked(requireActiveMember).mockRejectedValueOnce(new ActionError("unauthorized"));
  await expect(recordPushClientUsage("pwa_launch_browser")).resolves.toBeUndefined();
  expect(recordUsage).not.toHaveBeenCalled();

  // Any other failure still surfaces.
  vi.mocked(requireActiveMember).mockRejectedValueOnce(new Error("db down"));
  await expect(recordPushClientUsage("push_opened")).rejects.toThrow("db down");
  expect(recordUsage).not.toHaveBeenCalled();

  for (const event of ["pwa_launch_standalone", "pwa_launch_browser", "push_opened"]) {
    await recordPushClientUsage(event);
  }
  expect(vi.mocked(recordUsage).mock.calls.flat()).toEqual(["pwa_launch_standalone", "pwa_launch_browser", "push_opened"]);
});
