import { and, asc, eq, ne } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import type { SubscriptionInput } from "./subscription";

// A person's devices for Web Push (PWA spec v1.2, DEV-02..DEV-06, WGR-01).
// A row belongs to the person who signed in (session personId), never to the
// family account they work on: a relative's phone gets only their own
// notices. Callers have checked the session and the input's shape
// (lib/push/subscription.ts).

type Db = ReturnType<typeof getDb>;

// The endpoint is unique: the same browser signed in as someone else moves to
// that person (they presented the browser's secret, so they control it).
export async function saveDevice(
  db: Db,
  personId: string,
  subscription: SubscriptionInput,
  label: string | null,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      subscriptionId: crypto.randomUUID(),
      personId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      deviceLabel: label,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { personId, p256dh: subscription.p256dh, auth: subscription.auth, deviceLabel: label },
    });
}

// DEV-04: forget this browser for this person only. False when there was no
// such row (another person's endpoint is never touched here).
export async function removeDevice(db: Db, personId: string, endpoint: string): Promise<boolean> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.personId, personId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.subscriptionId });
  return removed.length > 0;
}

// DEV-06: "Scollega" on one of the person's devices, by id.
export async function removeDeviceById(db: Db, personId: string, subscriptionId: string): Promise<boolean> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.personId, personId), eq(pushSubscriptions.subscriptionId, subscriptionId)))
    .returning({ id: pushSubscriptions.subscriptionId });
  return removed.length > 0;
}

// DEV-02/DEV-03: whose is the endpoint this browser holds? "mine": a row of
// this person; "none": no row (one tap completes it); "other": someone else's
// row, left by a sign-out without unbinding or an expired session. That row
// is deleted and nothing is bound to this person: they turn push on
// themselves. Nothing else about the other person is revealed.
export type DeviceOwner = "mine" | "other" | "none";

export async function devicePushStatus(db: Db, personId: string, endpoint: string): Promise<DeviceOwner> {
  const [row] = await db
    .select({ personId: pushSubscriptions.personId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  if (!row) return "none";
  if (row.personId === personId) return "mine";
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), ne(pushSubscriptions.personId, personId)));
  return "other";
}

// DEV-06: the person's devices, without endpoints or keys (they never go back
// to the client). The client tells "this device" apart with isCurrentDevice.
export type DeviceRow = { id: string; label: string | null; createdAt: Date; lastUsedAt: Date | null };

export async function listDevices(db: Db, personId: string): Promise<DeviceRow[]> {
  return db
    .select({
      id: pushSubscriptions.subscriptionId,
      label: pushSubscriptions.deviceLabel,
      createdAt: pushSubscriptions.createdAt,
      lastUsedAt: pushSubscriptions.lastUsedAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.personId, personId))
    .orderBy(asc(pushSubscriptions.createdAt));
}

// The id of this browser's row for this person, or null: how the device list
// marks "this device" without sending endpoints to the client.
export async function currentDeviceId(db: Db, personId: string, endpoint: string): Promise<string | null> {
  const [row] = await db
    .select({ id: pushSubscriptions.subscriptionId })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.personId, personId), eq(pushSubscriptions.endpoint, endpoint)));
  return row?.id ?? null;
}
