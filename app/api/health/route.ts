import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pushState } from "@/lib/push/config";
import { getPushTotalsToday } from "@/lib/usage/events";
import { checkHealth, healthResponse } from "@/lib/health";
import packageJson from "@/package.json";

// Liveness for uptime monitors, the post-deploy smoke test and the FlyLabs
// Console (Playbook 7.1). The probe returns health plus the push state and
// anonymous UTC counters. Probe failures are silent because it is public.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let pushToday: Awaited<ReturnType<typeof getPushTotalsToday>> = {};
  const options = { version: packageJson.version };
  const [health, totalsProbe] = await Promise.all([
    checkHealth(() => getDb().execute(sql`SELECT 1`), options),
    checkHealth(async () => { pushToday = await getPushTotalsToday(); }, options),
  ]);
  const response = { ...health, push: pushState(), pushToday: totalsProbe.ok ? pushToday : {} };
  return healthResponse(response);
}
