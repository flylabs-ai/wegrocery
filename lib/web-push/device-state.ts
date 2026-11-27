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
