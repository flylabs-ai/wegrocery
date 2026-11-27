import { createECDH, createHash } from "node:crypto";

// OPS-07 (PWA spec v1.2): are the VAPID keys of this environment a pair?
// The public key is derived from the private one; with a public key that
// does not match, every push service answers 401/403 and the browser, which
// subscribed with the public key, cannot be reached. The result carries only
// a state and the first 8 hex digits of SHA-256 of the declared public key,
// so two environments can be compared without printing a key.
// No imports from the app: scripts/vapid-check.mjs runs this file with node.

export type VapidState = "missing" | "invalid" | "coherent" | "incoherent";

export type VapidCheck = {
  state: VapidState;
  // SHA-256 of the decoded public key, first 8 hex digits; null when absent.
  publicFingerprint: string | null;
  subject: "ok" | "missing" | "invalid";
};

export type VapidInput = { publicKey?: string; privateKey?: string; subject?: string };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decode(value: string): Buffer | null {
  const trimmed = value.trim().replace(/=+$/, "");
  if (!BASE64URL.test(trimmed)) return null;
  return Buffer.from(trimmed, "base64url");
}

function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function checkVapid(input: VapidInput): VapidCheck {
  const publicRaw = input.publicKey?.trim();
  const privateRaw = input.privateKey?.trim();
  const subjectRaw = input.subject?.trim();
  const subject: VapidCheck["subject"] = !subjectRaw
    ? "missing"
    : subjectRaw.startsWith("mailto:") || subjectRaw.startsWith("https://")
      ? "ok"
      : "invalid";

  const publicKey = publicRaw ? decode(publicRaw) : null;
  const publicFingerprint = publicKey && publicKey.length > 0 ? fingerprint(publicKey) : null;
  if (!publicRaw || !privateRaw) return { state: "missing", publicFingerprint, subject };

  const privateKey = decode(privateRaw);
  // P-256: 65-byte uncompressed point, 32-byte scalar.
  if (!publicKey || publicKey.length !== 65 || publicKey[0] !== 0x04 || !privateKey || privateKey.length !== 32) {
    return { state: "invalid", publicFingerprint, subject };
  }
  let derived: Buffer;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    derived = ecdh.getPublicKey();
  } catch {
    return { state: "invalid", publicFingerprint, subject };
  }
  return { state: derived.equals(publicKey) ? "coherent" : "incoherent", publicFingerprint, subject };
}

// The line the script prints: names and states only, never a key.
export function describeVapid(check: VapidCheck): string {
  const words: Record<VapidState, string> = {
    missing: "keys missing",
    invalid: "invalid keys",
    coherent: "coherent",
    incoherent: "incoherent",
  };
  return `VAPID: ${words[check.state]} / public fingerprint ${check.publicFingerprint ?? "-"} / subject ${check.subject}`;
}
