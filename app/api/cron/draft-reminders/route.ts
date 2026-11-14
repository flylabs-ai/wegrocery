import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { cronAuthorized } from "@/lib/cycles/cron-auth";
import { sendDraftReminders } from "@/lib/notifications/draft-reminder-store";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const result = await sendDraftReminders(getDb(), new Date());
    console.info(`[draft_reminders] ok, sent ${result.sent} on ${result.cycles} cycles`);
    if (result.sent > 0) revalidatePath("/notifiche");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    reportError("draft_reminders", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
