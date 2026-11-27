import { getDb } from "@/lib/db/client";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { runPushQueue } from "@/lib/push/queue-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WGR-05: hourly recovery of the draft reminder push queue. It only claims
// and sends jobs already booked; it books no reminder and writes no inbox or
// email. With an empty queue it costs one statement.
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers, process.env.CRON_SECRET)) {
    return new Response("Not found", { status: 404 });
  }
  const result = await runPushQueue(getDb(), new Date());
  if (result) console.info(`[push_deliveries] ok, claimed ${result.claimed}, accepted ${result.accepted}, retry ${result.retry}, left ${result.left}`);
  return Response.json({ ok: result !== null, ...(result ?? {}) });
}
