"use server";

import { ActionError } from "@/lib/action-error";
import { requireActiveMember } from "@/lib/auth/session";
import { recordUsage } from "@/lib/usage/events";

// The service worker bridge sits in the root layout, so it also calls this on
// public pages (/login, /gruppo) for visitors who are not signed in. Those
// launches are not counted, and the refusal stays here instead of reaching
// the runtime logs as an unhandled Server Action error.
export async function recordPushClientUsage(event: unknown): Promise<void> {
  if (event !== "pwa_launch_standalone" && event !== "pwa_launch_browser" && event !== "push_opened") return;
  try {
    await requireActiveMember();
  } catch (e) {
    if (e instanceof ActionError) return;
    throw e;
  }
  await recordUsage(event);
}
