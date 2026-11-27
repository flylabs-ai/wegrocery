import { createECDH, createHash } from "node:crypto";
import { decodeKey } from "./subscription";

type Env = Record<string, string | undefined>;
export type PushState = "off" | "simulated" | "live" | "misconfigured";

function validSubject(subject: string): boolean {
  if (/\s/.test(subject)) return false;
  try {
    const url = new URL(subject);
    return url.protocol === "mailto:"
      ? /^[^@]+@[^@]+$/.test(url.pathname) && !url.search && !url.hash
      : subject.startsWith("https://") && url.hostname !== "localhost" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function pushKeys(env: Env = process.env) {
  const publicKey = decodeKey(env.VAPID_PUBLIC_KEY?.trim() ?? "", 65);
  const privateKey = decodeKey(env.VAPID_PRIVATE_KEY?.trim() ?? "", 32);
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !validSubject(subject)) return null;

  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    if (!ecdh.getPublicKey().equals(publicKey)) return null;
  } catch {
    return null;
  }
  return { publicKey: publicKey.toString("base64url"), privateKey: privateKey.toString("base64url"), subject };
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
  return env.PUSH_TRANSPORT === "live" &&
    ((env.VERCEL_ENV === "production" && env.DEMO_MODE !== "true") || segregatedOriginMatches(env));
}

function pilotMembers(env: Env): string[] | undefined {
  return env.PUSH_PILOT_MEMBER_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
}

export function resolveTransport(env: Env, personId: string): "live" | "simulated" {
  const pilot = pilotMembers(env);
  return allowsLive(env) && (!pilot || pilot.includes(personId)) && pushKeys(env) ? "live" : "simulated";
}

export function pushState(env: Env = process.env): PushState {
  if (!env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY && !env.VAPID_SUBJECT && env.PUSH_TRANSPORT !== "live") {
    return "off";
  }
  if (!pushKeys(env)) return "misconfigured";
  if (env.PUSH_TRANSPORT === "off") return "off";
  return allowsLive(env) && pilotMembers(env)?.length !== 0 ? "live" : "simulated";
}
