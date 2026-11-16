import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, type SendDependencies, type SendPayload, type SendRequestOptions, type SendResponse } from "./send";
import { emailIdempotencyKey, minuteBucket } from "./idempotency";
import { STELLAR } from "./layout.test.data";

const message = { to: "member@example.com", subject: "Example subject", text: "Synthetic body" };
const now = new Date("2026-11-16T12:00:01Z");
function setup() {
  const send = vi.fn<(payload: SendPayload, options: SendRequestOptions) => Promise<SendResponse>>(async () => ({ data: { id: "example-id" }, error: null }));
  const deps: SendDependencies = { client: { emails: { send } }, config: STELLAR, from: "sender@example.com", senderName: "Example app", env: { vercelEnv: "production" }, blockedError: "Email disabled", now: () => now };
  return { send, deps };
}
afterEach(() => vi.useRealTimers());
describe("sendEmail", () => {
  it("injects the client, formats the sender and always provides an idempotency key", async () => {
    vi.useFakeTimers();
    const { send, deps } = setup();
    expect(await sendEmail(message, deps)).toEqual({ ok: true, id: "example-id" });
    const [payload, options] = send.mock.calls[0];
    expect(payload).toMatchObject({ from: "Example app <sender@example.com>", to: [message.to], subject: message.subject, text: message.text });
    expect(payload.html).toContain("Synthetic body");
    expect(options.idempotencyKey).toBe(emailIdempotencyKey(message.to, message.subject, message.text, "", minuteBucket(now)));
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves caller keys, named senders, cc, replyTo, attachments and headers", async () => {
    const { send, deps } = setup();
    const extra = { from: "Named <override@example.com>", cc: ["copy@example.com"], replyTo: "reply@example.com", headers: { Example: "value" }, attachments: [{ filename: "example.txt", content: "Synthetic attachment" }], idempotencyKey: "logical-event-42" };
    await sendEmail({ ...message, ...extra }, deps);
    expect(send.mock.calls[0][0]).toMatchObject({ from: extra.from, cc: extra.cc, replyTo: extra.replyTo, headers: extra.headers, attachments: extra.attachments, to: [message.to] });
    expect(send.mock.calls[0][1].idempotencyKey).toBe(extra.idempotencyKey);
  });
  it("keeps the caller's nonempty idempotency key byte for byte", async () => {
    const { send, deps } = setup();
    await sendEmail({ ...message, idempotencyKey: " event-key " }, deps);
    expect(send.mock.calls[0][1].idempotencyKey).toBe(" event-key ");
  });
  it("redirects previews, drops cc and includes the resolved recipient in its fallback key", async () => {
    const { send, deps } = setup();
    deps.env = { vercelEnv: "preview", redirectTo: "test@example.test" };
    await sendEmail({ ...message, cc: ["copy@example.com"] }, deps);
    expect(send.mock.calls[0][0]).toMatchObject({ to: ["test@example.test"], subject: `[STAGING -> ${message.to}] ${message.subject}` });
    expect(send.mock.calls[0][0]).not.toHaveProperty("cc");
    expect(send.mock.calls[0][1].idempotencyKey).toBe(emailIdempotencyKey("test@example.test", `[STAGING -> ${message.to}] ${message.subject}`, message.text, "", minuteBucket(now)));
  });
  it("blocks before calling the client and rejects a missing sender", async () => {
    const { send, deps } = setup();
    expect(await sendEmail(message, { ...deps, env: { vercelEnv: undefined } })).toEqual({ ok: false, error: "Email disabled" });
    expect(await sendEmail(message, { ...deps, from: "" })).toEqual({ ok: false, error: "Email sender is not configured" });
    expect(send).not.toHaveBeenCalled();
  });
  it("returns sanitized failures for provider errors and thrown errors", async () => {
    const { deps } = setup();
    for (const fail of [async () => ({ data: null, error: { message: `${message.to}: ${message.text}` } }), async () => { throw new Error(`${message.to}: ${message.text}`); }]) {
      const result = await sendEmail(message, { ...deps, client: { emails: { send: fail } } });
      expect(result).toEqual({ ok: false, error: "Email send failed" });
      expect(JSON.stringify(result)).not.toContain(message.to);
      expect(JSON.stringify(result)).not.toContain(message.text);
    }
  });
  it.each([undefined, 25])("aborts and stops waiting even when the client ignores the signal (timeout %s)", async (timeoutMs) => {
    vi.useFakeTimers();
    const { deps } = setup();
    let signal: AbortSignal | undefined;
    const send = (payload: SendPayload, options: SendRequestOptions) => { expect(payload.to).toEqual([message.to]); signal = options.signal; return new Promise<never>(() => {}); };
    const result = sendEmail(message, { ...deps, timeoutMs, client: { emails: { send } } });
    await vi.advanceTimersByTimeAsync((timeoutMs ?? 10_000) - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, error: "Email send timed out" });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
