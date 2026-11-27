"use server";

import { and, eq } from "drizzle-orm";
import { requireActiveMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { pushConsents } from "@/lib/db/schema";

export async function readPushConsentAction(category: unknown): Promise<boolean> {
  const { personId } = await requireActiveMember();
  if (category !== "draft_reminder" || !process.env.VAPID_PUBLIC_KEY?.trim()) return false;
  const [row] = await getDb()
    .select({ enabled: pushConsents.enabled })
    .from(pushConsents)
    .where(and(eq(pushConsents.personId, personId), eq(pushConsents.category, category)));
  return row?.enabled ?? false;
}

export async function writePushConsentAction(category: unknown, enabled: unknown): Promise<{ ok: boolean }> {
  const { personId } = await requireActiveMember();
  if (category !== "draft_reminder" || typeof enabled !== "boolean" || !process.env.VAPID_PUBLIC_KEY?.trim()) {
    return { ok: false };
  }
  await getDb()
    .insert(pushConsents)
    .values({ personId, category, enabled })
    .onConflictDoUpdate({
      target: [pushConsents.personId, pushConsents.category],
      set: { enabled, updatedAt: new Date() },
    });
  return { ok: true };
}
