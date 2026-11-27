"use server";

import { requireActiveMember } from "@/lib/auth/session";
import { recordUsage } from "@/lib/usage/events";

export async function recordPushClientUsage(event: unknown): Promise<void> {
  if (event !== "pwa_launch_standalone" && event !== "pwa_launch_browser" && event !== "push_opened") return;
  await requireActiveMember();
  await recordUsage(event);
}
