import { emailHtml, type EmailConfig } from "./layout";
import { emailIdempotencyKey, minuteBucket } from "./idempotency";
import { resolveOutbound, type OutboundEnv } from "./outbound-policy";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  from?: string;
  cc?: readonly string[];
  replyTo?: string;
  heading?: string | null;
  signature?: boolean;
  attachments?: { filename: string; content: Buffer | string }[];
  headers?: Record<string, string>;
  idempotencyKey?: string;
};
export type SendPayload = {
  from: string; to: string[]; subject: string; text: string; html: string;
  cc?: string[]; replyTo?: string; attachments?: EmailMessage["attachments"]; headers?: Record<string, string>;
};
export type SendRequestOptions = { idempotencyKey: string; signal: AbortSignal };
export type SendResponse = { data?: { id?: string } | null; error?: unknown };
export type SendDependencies = {
  client: { emails: { send(payload: SendPayload, options: SendRequestOptions): Promise<SendResponse> } };
  config: EmailConfig;
  from: string;
  senderName?: string;
  baseUrl?: string;
  env: OutboundEnv;
  blockedError: string;
  timeoutMs?: number;
  now?: () => Date;
};
export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

/** No SDK/env imports or logging. The app owns configuration and the client. */
export async function sendEmail(message: EmailMessage, deps: SendDependencies): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const target = resolveOutbound(message, deps.env, deps.blockedError);
    if (target.action === "block") return { ok: false, error: target.error };
    const value = message.from?.trim() || deps.from.trim();
    if (!value) return { ok: false, error: "Email sender is not configured" };
    const from = deps.senderName && !value.includes("<") ? `${deps.senderName} <${value}>` : value;
    const timeoutMs = deps.timeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) return { ok: false, error: "Invalid email timeout" };
    const controller = new AbortController();
    const payload: SendPayload = {
      from, to: [target.to], subject: target.subject, text: message.text,
      html: emailHtml(message.text, deps.config, { subject: target.subject, baseUrl: deps.baseUrl ?? "", heading: message.heading, signature: message.signature }),
      ...(target.cc.length ? { cc: target.cc } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments ? { attachments: message.attachments } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };
    const idempotencyKey = message.idempotencyKey || emailIdempotencyKey(
      target.to, target.subject, message.text, message.attachments?.map((item) => item.filename).join(",") ?? "", minuteBucket(deps.now?.() ?? new Date()),
    );
    const timeout = new Promise<SendResponse>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({ error: true });
      }, timeoutMs);
    });
    // The race also bounds older injected clients that ignore AbortSignal.
    const response = await Promise.race([deps.client.emails.send(payload, { idempotencyKey, signal: controller.signal }), timeout]);
    if (timedOut) return { ok: false, error: "Email send timed out" };
    if (response.error) return { ok: false, error: "Email send failed" };
    return response.data?.id ? { ok: true, id: response.data.id } : { ok: true };
  } catch {
    // Provider messages and exceptions may contain recipients or message bodies.
    return { ok: false, error: timedOut ? "Email send timed out" : "Email send failed" };
  } finally { clearTimeout(timer); }
}
