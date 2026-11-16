import { Resend } from "resend";
import { brand } from "@/lib/brand";
import { getBrand } from "@/lib/brand/get-brand";
import { t } from "@/lib/i18n";
import { getAppBaseUrl } from "./base-url";
import { emailColors, emailConfig, outboundEnvFromProcess } from "./email.config";
import { emailIdempotencyKey, minuteBucket } from "./idempotency";
import { emailHtml, emailLogoUrl, type EmailIdentity } from "./layout";
import { resolveOutbound, resolveOutboundBatch } from "./outbound-policy";
import { sendEmail } from "./send";

type Attachment = {
  filename: string;
  content: Buffer | string;
};

type SendMailOpts = {
  to: string;
  cc?: string | string[];
  // Optional override for the From header. When omitted, falls back to
  // MAIL_FROM. Note that Resend requires the From domain to be verified
  // on the account, so passing an arbitrary email may fail at send time.
  from?: string;
  // Where replies should land. Improves deliverability (a real reply-able
  // address is a trust signal to spam filters) and means "reply" on the
  // recipient's side actually reaches someone, even if `from` is a no-reply
  // archive address.
  replyTo?: string;
  subject: string;
  // The message as the template wrote it. The HTML part is always derived
  // from it here (lib/email/layout.ts, Playbook 7.7), so the two never drift.
  text: string;
  // A title on top of the HTML card (a notification's); the subject carries it already.
  heading?: string | null;
  attachments?: Attachment[];
  // Extra headers (List-Unsubscribe and its Post companion).
  headers?: Record<string, string>;
  // Resend drops a repeat of the same key for 24 hours. When omitted, the key
  // is derived from the message and the minute it was asked in, so a double
  // click sends once and a deliberate resend a minute later still goes out.
  idempotencyKey?: string;
};

// The branded HTML part every email carries next to its text (Playbook 7.7,
// FlyLabs Kit `email` 2.0, settings in email.config.ts): the group's logo,
// name and colours, the text on a card, the WeGrocery logo and "by
// flylabs.ai" unless the group switched it off (brand.flylabsSignature,
// Playbook 2.11). Without a base URL the logos become names in text.
type Look = { identity: EmailIdentity; signature: boolean; baseUrl: string };

function brandedHtml(text: string, subject: string, look: Look, heading?: string | null): string {
  return emailHtml(text, emailConfig(look.identity), { subject, baseUrl: look.baseUrl, signature: look.signature, heading });
}

// The group as the app shows it (getBrand: Impostazioni over the brand JSON).
// A message never waits on it: should the identity not load, the brand JSON
// goes out.
async function emailLook(): Promise<Look> {
  const baseUrl = getAppBaseUrl() ?? "";
  const b = await getBrand().catch(() => brand);
  return {
    baseUrl,
    signature: b.flylabsSignature,
    identity: {
      name: b.appName,
      logoUrl: emailLogoUrl(b.logoUrl, baseUrl),
      showName: b.headerShowName,
      colors: emailColors(b.theme),
    },
  };
}

// Returns the configured default sender (MAIL_FROM) so the client can
// pre-fill the Mittente field of the supplier-email dialog.
export function getMailFromDefault(): string | null {
  return process.env.MAIL_FROM ?? null;
}

// Thin wrapper around Resend's SDK that returns a discriminated result
// instead of throwing. Outside the Vercel production deployment the recipient
// is rewritten to EMAIL_REDIRECT_TO (or the send refused) by resolveOutbound,
// because staging and previews run on copies of the real member list. Read
// env vars lazily so the module can be imported in environments where Resend isn't configured (e.g. local dev without
// the API key) without crashing at startup.
export async function sendMail(
  opts: SendMailOpts,
): Promise<{ ok: true; id?: string } | { error: string }> {
  if (process.env.DEMO_MODE === "true") {
    return { error: t.errors.demoEmailDisabled };
  }
  const ccIn = opts.cc == null ? [] : Array.isArray(opts.cc) ? opts.cc : [opts.cc];
  // Refused outside production without a redirect before touching Resend
  // (sendEmail applies the same policy to the message it sends).
  const env = outboundEnvFromProcess();
  const target = resolveOutbound({ to: opts.to, cc: ccIn, subject: opts.subject }, env, t.errors.emailDisabledOutsideProduction);
  if (target.action === "block") return { error: target.error };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY non configurata" };
  const from = opts.from?.trim() || process.env.MAIL_FROM;
  if (!from) return { error: "MAIL_FROM non configurata" };
  const look = await emailLook();
  // The kit decides the recipient (resolveOutbound), builds the HTML, the
  // idempotency key and the timeout; its errors carry no address or text.
  const result = await sendEmail(
    {
      to: opts.to,
      cc: ccIn,
      from,
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      heading: opts.heading,
      signature: look.signature,
      attachments: opts.attachments,
      headers: opts.headers,
      idempotencyKey: opts.idempotencyKey,
    },
    {
      client: new Resend(apiKey),
      config: emailConfig(look.identity),
      from,
      baseUrl: look.baseUrl,
      env,
      blockedError: t.errors.emailDisabledOutsideProduction,
    },
  );
  if (result.ok) return { ok: true, id: result.id };
  return { error: result.error === t.errors.emailDisabledOutsideProduction ? result.error : t.errors.emailSendFailed };
}

// Sends many independent one-off emails in a single call via Resend's batch
// API (up to 100 per request — this sidesteps the 2 req/s rate limit and the
// serverless timeout when notifying a whole cooperative). Chunks internally so
// callers don't have to. Same guards as sendMail: blocked in demo, never
// throws, returns a discriminated result. No attachments (batch doesn't
// support them). `sent` counts messages handed to Resend, not deliveries.
export async function sendMailBatch(
  items: ReadonlyArray<{ to: string; subject: string; text: string; heading?: string | null; headers?: Record<string, string> }>,
  from?: string,
  // Names this fan-out; each chunk of 100 derives its own key from it.
  idempotencyKey?: string,
): Promise<{ ok: true; sent: number } | { error: string }> {
  if (items.length === 0) return { ok: true, sent: 0 };
  if (process.env.DEMO_MODE === "true") return { error: t.errors.demoEmailDisabled };
  // Same outbound policy as sendMail, per message; outside production the
  // redirected fan-out is also capped to a few samples (see
  // resolveOutboundBatch). The decision depends only on the environment, so
  // either every item is blocked or none is.
  const decision = resolveOutboundBatch(
    items,
    outboundEnvFromProcess(),
    t.errors.emailDisabledOutsideProduction,
  );
  if (decision.action === "block") return { error: decision.error };
  const targets = decision.messages;
  if (decision.suppressed > 0) {
    console.info(`[email] outside production: ${decision.suppressed} redirected batch messages suppressed`);
  }
  const apiKey = process.env.RESEND_API_KEY;
  const sender = from?.trim() || process.env.MAIL_FROM;
  if (!apiKey) return { error: "RESEND_API_KEY non configurata" };
  if (!sender) return { error: "MAIL_FROM non configurata" };
  const look = await emailLook();

  try {
    const resend = new Resend(apiKey);
    for (let i = 0; i < targets.length; i += 100) {
      const chunk = targets.slice(i, i + 100);
      const { error } = await resend.batch.send(
        chunk.map((it) => ({
          from: sender,
          to: [it.to],
          subject: it.subject,
          text: it.text,
          html: brandedHtml(it.text, it.subject, look, it.heading),
          ...(it.headers ? { headers: it.headers } : {}),
        })),
        {
          idempotencyKey: emailIdempotencyKey(
            idempotencyKey ?? minuteBucket(),
            i,
            ...chunk.flatMap((it) => [it.to, it.subject]),
          ),
        },
      );
      if (error) return { error: error.message || t.errors.emailSendFailed };
    }
    return { ok: true, sent: targets.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : t.errors.emailSendFailed };
  }
}
