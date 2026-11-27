import { createHash } from "node:crypto";
import { decodeKey } from "./subscription";
import { pushKeys as kitPushKeys, resolveTransport as resolveKitTransport, type TransportPolicy } from "@/lib/web-push/config";

type Env = Record<string, string | undefined>;
export type PushState = "off" | "simulated" | "live" | "misconfigured";

function vapidInput(env: Env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

export function pushKeys(env: Env = process.env) {
  return kitPushKeys(vapidInput(env));
}

export function vapidFingerprint(env: Env): string | null {
  const key = decodeKey(env.VAPID_PUBLIC_KEY?.trim() ?? "", 65);
  return key ? createHash("sha256").update(key).digest("hex").slice(0, 8) : null;
}

function httpsOrigin(value: string | undefined): string | null {
  if (!value || !/^https:\/\/[^/\s?#\\]+\/?$/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.origin;
  } catch {
    return null;
  }
}

function segregatedOriginMatches(env: Env): boolean {
  // Do not fall back to a production APP_BASE_URL on a Vercel preview.
  const current = env.VERCEL_URL
    ? httpsOrigin(`https://${env.VERCEL_URL}`)
    : env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview"
      ? null
      : httpsOrigin(env.APP_BASE_URL);
  return current !== null && httpsOrigin(env.PUSH_SEGREGATED_ORIGIN) === current;
}

function allowsLive(env: Env): boolean {
  return env.PUSH_TRANSPORT === "live" && environmentAllowed(env);
}

function environmentAllowed(env: Env): boolean {
  return (env.VERCEL_ENV === "production" && env.DEMO_MODE !== "true") || segregatedOriginMatches(env);
}

function pilotMembers(env: Env): string[] | undefined {
  return env.PUSH_PILOT_MEMBER_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
}

export function transportPolicy(env: Env, personId: string): TransportPolicy {
  const pilot = pilotMembers(env);
  return {
    requested: env.PUSH_TRANSPORT === "live",
    environmentAllowed: environmentAllowed(env),
    recipientAllowed: !pilot || pilot.includes(personId),
    vapid: vapidInput(env),
  };
}

export function resolveTransport(env: Env, personId: string): "live" | "simulated" {
  return resolveKitTransport(transportPolicy(env, personId)).mode;
}

export function pushState(env: Env = process.env): PushState {
  if (!env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY && !env.VAPID_SUBJECT && env.PUSH_TRANSPORT !== "live") {
    return "off";
  }
  if (!pushKeys(env)) return "misconfigured";
  if (env.PUSH_TRANSPORT === "off") return "off";
  return allowsLive(env) && pilotMembers(env)?.length !== 0 ? "live" : "simulated";
}
