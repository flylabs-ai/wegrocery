import { secretUsable } from "@/lib/security/secrets";

// Who may call the cron routes is in lib/security/cron-auth.ts (FlyLabs Kit
// module sicurezza): Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`,
// with a secret of at least 32 characters.

/** Whether this deploy opens planned cycles by itself: a long enough CRON_SECRET (see vercel.json). */
export function autoOpenEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return secretUsable(env.CRON_SECRET);
}
