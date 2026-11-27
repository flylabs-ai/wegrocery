import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { sendDraftReminders } from "@/lib/notifications/draft-reminder-store";
import { reportError } from "@/lib/observability";
import { runPushQueue } from "@/lib/push/queue-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers, process.env.CRON_SECRET)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const result = await sendDraftReminders(getDb(), new Date());
    console.info(`[draft_reminders] ok, sent ${result.sent} on ${result.cycles} cycles`);
    if (result.sent > 0) revalidatePath("/notifiche");
    // WGR-05: the push jobs just booked go out now; the hourly
    // /api/cron/push-deliveries recovers the rest. Never fails this route.
    const push = await runPushQueue(getDb(), new Date(), { clean: true });
    return Response.json({ ok: true, ...result, push: push ? { claimed: push.claimed, accepted: push.accepted } : null });
  } catch (error) {
    reportError("draft_reminders", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
