"use server";

import { headers } from "next/headers";
import { requireActiveMember } from "@/lib/auth/session";
import { recordUsage } from "@/lib/usage/events";
import { getDb } from "@/lib/db/client";
import {
  currentDeviceId,
  devicePushStatus,
  listDevices,
  removeDevice,
  removeDeviceById,
  saveDevice,
  type DeviceOwner,
  type DeviceRow,
} from "@/lib/push/devices";
import { deviceLabel, isEndpoint, parseSubscription } from "@/lib/push/subscription";

// Server side of "Sul dispositivo" for WeGrocery (PWA spec v1.2, DEV-01..06).
// Every action acts for the person who signed in (personId), never for the
// family account they work on. The UI (W4) calls these; the channel stays
// simulated until PUSH_TRANSPORT=live (WGR-07), and without a VAPID public
// key there is no channel at all, so nothing is stored.

function channelExists(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim());
}

/** DEV-01: store this browser's subscription for the signed-in person. */
export async function savePushDeviceAction(input: unknown): Promise<{ ok: true } | { ok: false; error: "invalid" | "unavailable" }> {
  const { personId } = await requireActiveMember();
  if (!channelExists()) return { ok: false, error: "unavailable" };
  const subscription = parseSubscription(input);
  if (!subscription) return { ok: false, error: "invalid" };
  await saveDevice(getDb(), personId, subscription, deviceLabel((await headers()).get("user-agent")));
  await recordUsage("push_device_on");
  return { ok: true };
}

/** DEV-02/03: whose is this browser's endpoint? Null for an endpoint of the wrong shape. */
export async function devicePushStatusAction(endpoint: unknown): Promise<DeviceOwner | null> {
  const { personId } = await requireActiveMember();
  if (!isEndpoint(endpoint)) return null;
  return devicePushStatus(getDb(), personId, endpoint);
}

/** DEV-04 (and "turn off on this device"): forget this browser for this person. */
export async function removePushDeviceAction(endpoint: unknown): Promise<{ ok: boolean }> {
  const { personId } = await requireActiveMember();
  if (!isEndpoint(endpoint)) return { ok: false };
  return { ok: await removeDevice(getDb(), personId, endpoint) };
}

/** DEV-06: the person's devices; `current` is this browser's row id when the endpoint is given and theirs. */
export async function listPushDevicesAction(
  endpoint?: unknown,
): Promise<{ devices: DeviceRow[]; current: string | null }> {
  const { personId } = await requireActiveMember();
  const db = getDb();
  const [devices, current] = await Promise.all([
    listDevices(db, personId),
    isEndpoint(endpoint) ? currentDeviceId(db, personId, endpoint) : Promise.resolve(null),
  ]);
  return { devices, current };
}

/** DEV-06: "Scollega" on one of the person's devices. */
export async function removePushDeviceByIdAction(subscriptionId: unknown): Promise<{ ok: boolean }> {
  const { personId } = await requireActiveMember();
  if (typeof subscriptionId !== "string" || subscriptionId.length > 64) return { ok: false };
  const ok = await removeDeviceById(getDb(), personId, subscriptionId);
  if (ok) await recordUsage("push_device_off");
  return { ok };
}
