import { getBrand } from "@/lib/brand/get-brand";
import { t } from "@/lib/i18n";
import { formatDeadlineLong } from "@/lib/i18n/deadline";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  badge?: number;
  schemaVersion: 1;
  eventId?: string;
};

const MAX_PUSH_PAYLOAD_BYTES = 3 * 1024;

export function serializePushPayload(payload: PushPayload): string {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > MAX_PUSH_PAYLOAD_BYTES) throw new RangeError("Push payload exceeds 3 KB");
  return serialized;
}

export async function draftReminderPayload({ cycleId, closeAt, eventKey }: {
  cycleId: string;
  closeAt: Date | string;
  eventKey: string;
}): Promise<PushPayload> {
  const brand = await getBrand();
  const payload: PushPayload = {
    title: brand.shortName,
    body: t.pwa.draftReminder(formatDeadlineLong(closeAt)),
    url: `/ordine?${new URLSearchParams({ cycleId })}`,
    tag: eventKey,
    schemaVersion: 1,
  };
  serializePushPayload(payload);
  return payload;
}
