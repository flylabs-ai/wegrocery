// This browser and push notifications, client side (PWA spec v1.2, DEV-01..04).
// Ported from Stellar Reviews (web/app/(app)/impostazioni/notifiche/push-device.ts):
// keep in sync until the FlyLabs Kit web-push module (A6). Every decision is a
// plain function, tested without a browser; the server actions are passed in,
// so this file stays free of server code.

// "incomplete": the browser holds a subscription the server has no row for
// (saving failed, or the row was cleaned up): one tap completes it (DEV-02).
export type DeviceState = "checking" | "unsupported" | "ios" | "denied" | "off" | "incomplete" | "on";

export type DeviceOwner = "mine" | "other" | "none";

export type DeviceEnv = {
  hasServiceWorker: boolean;
  hasPush: boolean;
  permission: NotificationPermission | null;
  userAgent: string;
  standalone: boolean;
};

// Before asking anything: an iPhone or iPad gets push only in the app added
// to the Home Screen; a browser without the APIs gets nothing; a refusal
// stays until the person changes it in the browser settings.
export function deviceState(env: DeviceEnv, subscribed: boolean): DeviceState {
  const ios = /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && /Mobile\//.test(env.userAgent));
  if (ios && !env.standalone) return "ios";
  if (!env.hasServiceWorker || !env.hasPush || env.permission === null) return "unsupported";
  if (env.permission === "denied") return "denied";
  return subscribed && env.permission === "granted" ? "on" : "off";
}

// DEV-02: "on" only with the permission, a subscription in this browser and
// the server's row for this person.
export function reconciledState(local: DeviceState, owner: DeviceOwner | null): DeviceState {
  if (local !== "on") return local;
  if (owner === "mine") return "on";
  if (owner === "none") return "incomplete";
  // "other" (someone else's: dropped here) or no answer: off, the person
  // turns it on with their own tap.
  return "off";
}

// The VAPID public key as the Push API wants it.
export function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function currentEnv(): DeviceEnv {
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPush: "PushManager" in window,
    permission: "Notification" in window ? Notification.permission : null,
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

export async function existingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function clearBadge(): Promise<void> {
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  await nav.clearAppBadge?.().catch(() => {});
}

// The state to show, checked with the server (`status` is
// devicePushStatusAction). On "other" the browser's subscription is dropped
// too (DEV-03): the server has already removed the other person's row.
export async function readDeviceState(status?: (endpoint: string) => Promise<DeviceOwner | null>): Promise<DeviceState> {
  const env = currentEnv();
  const first = deviceState(env, false);
  if (first !== "off") return first;
  const subscription = await existingSubscription();
  const local = deviceState(env, subscription !== null);
  if (!subscription || !status) return local;
  let owner: DeviceOwner | null = null;
  try {
    owner = await status(subscription.endpoint);
  } catch {
    // Offline or the action failed: keep what the browser says, check again later.
    return local;
  }
  if (owner === "other") {
    await subscription.unsubscribe().catch(() => false);
    await clearBadge();
  }
  return reconciledState(local, owner);
}

// DEV-04, before the session ends (`unbind` is removePushDeviceAction): the
// server forgets this browser for this person, then the browser drops the
// subscription and the badge. Waits at most 3 s for the server, never throws,
// never blocks the sign-out: without a network the next reconciliation
// (DEV-03) closes the server's side. The person's other devices stay on.
export async function signOutDevice(unbind: (endpoint: string) => Promise<unknown>): Promise<void> {
  try {
    const subscription = await existingSubscription();
    if (subscription) {
      await Promise.race([unbind(subscription.endpoint).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
      await subscription.unsubscribe().catch(() => false);
    }
    await clearBadge();
  } catch {
    // Nothing here may stop the sign-out.
  }
}

// DEV-01: call straight from the tap, with no network call before it, so
// Safari keeps the gesture. Returns the subscription to save, or the state
// to show. If saving then fails, the caller calls unsubscribeDevice().
export async function subscribeDevice(publicKey: string): Promise<{ subscription: PushSubscriptionJSON } | { state: DeviceState }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "denied" : "off" };
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return { subscription: subscription.toJSON() };
}

// The endpoint to forget on the server, or null when there was none.
export async function unsubscribeDevice(): Promise<string | null> {
  const subscription = await existingSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
