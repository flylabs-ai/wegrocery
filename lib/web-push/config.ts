import { createECDH } from "node:crypto";
import { decodeKey } from "./subscription";
import type { VapidInput } from "./vapid-check";

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

export function pushKeys(input: VapidInput) {
  const publicKey = decodeKey(input.publicKey?.trim() ?? "", 65);
  const privateKey = decodeKey(input.privateKey?.trim() ?? "", 32);
  const subject = input.subject?.trim() ?? "";
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

export type TransportPolicy = {
  requested?: boolean;
  environmentAllowed?: boolean;
  recipientAllowed?: boolean;
  vapid?: VapidInput;
};

export function resolveTransport(policy: TransportPolicy = {}) {
  if (policy.requested === true && policy.environmentAllowed === true &&
      policy.recipientAllowed === true && policy.vapid) {
    const credentials = pushKeys(policy.vapid);
    if (credentials) return { mode: "live", credentials } as const;
  }
  return { mode: "simulated" } as const;
}
