import { createHmac, hkdfSync } from "node:crypto";
import { timingSafeEqualString } from "@/lib/security/secrets";

export type UnsubscribeConfig<Field extends string> = {
  secret: string;
  /** App-specific HKDF info; keep it stable for the lifetime of sent links. */
  context: string;
  fields: readonly Field[];
  categoryField: Field;
  isCategory: (value: string) => boolean;
  /** Verification only. New tokens always use HKDF and the v2 format. */
  legacy?: { format: "base64-dot" | "uuid-dot"; context: string; idField: Field };
};

const SALT = "flylabs-email-unsubscribe-v2";
const MAX_TOKEN_LENGTH = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function configured<Field extends string>(config: UnsubscribeConfig<Field>): boolean {
  return Boolean(config.secret && config.context && Buffer.byteLength(config.context) <= 1024
    && config.fields.length > 0 && config.fields.length <= 16
    && new Set(config.fields).size === config.fields.length
    && config.fields.every((field) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) && !["constructor", "prototype", "__proto__"].includes(field))
    && config.fields.includes(config.categoryField));
}

function claimsValid<Field extends string>(value: unknown, config: UnsubscribeConfig<Field>): value is Record<Field, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return Object.keys(claims).length === config.fields.length
    && config.fields.every((field) => Object.hasOwn(claims, field) && typeof claims[field] === "string" && claims[field].length > 0)
    && config.isCategory(claims[config.categoryField] as string);
}

function derivedKey<Field extends string>(config: UnsubscribeConfig<Field>): Buffer {
  return Buffer.from(hkdfSync("sha256", config.secret, SALT, config.context, 32));
}

function mac(payload: string, key: string | Buffer): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

function signatureMatches(signature: string, expected: Buffer): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  // The regex admits only 43 base64url characters, so the one canonical
  // encoding of a 32-byte MAC is the only string that can match.
  return timingSafeEqualString(signature, expected.toString("base64url"));
}

export function signUnsubscribeToken<Field extends string>(claims: Record<Field, string>, config: UnsubscribeConfig<Field>): string {
  if (!configured(config)) throw new Error("Invalid unsubscribe configuration");
  const selected = Object.fromEntries(config.fields.map((field) => [field, claims[field]]));
  if (!claimsValid(selected, config)) throw new Error("Invalid unsubscribe claims");
  const payload = Buffer.from(JSON.stringify(selected)).toString("base64url");
  const signed = `v2.${payload}`;
  const token = `${signed}.${mac(signed, derivedKey(config)).toString("base64url")}`;
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("Unsubscribe claims too large");
  return token;
}

function readLegacy<Field extends string>(token: string, config: UnsubscribeConfig<Field>): Record<Field, string> | null {
  const legacy = config.legacy;
  if (!legacy?.context || config.fields.length !== 2 || !config.fields.includes(legacy.idField) || legacy.idField === config.categoryField) return null;
  const parts = token.split(".");
  let id: string, category: string;
  if (legacy.format === "base64-dot") {
    if (parts.length !== 2 || !signatureMatches(parts[1], mac(parts[0], `${legacy.context}:${config.secret}`))) return null;
    const decoded = Buffer.from(parts[0], "base64url").toString("utf8");
    const dot = decoded.lastIndexOf(".");
    if (dot < 1) return null;
    id = decoded.slice(0, dot); category = decoded.slice(dot + 1);
  } else {
    if (parts.length !== 3 || !UUID.test(parts[0])) return null;
    const key = createHmac("sha256", config.secret).update(legacy.context).digest();
    if (!signatureMatches(parts[2], mac(`${parts[0]}.${parts[1]}`, key))) return null;
    [id, category] = parts;
  }
  const claims = { [legacy.idField]: id, [config.categoryField]: category };
  return claimsValid(claims, config) ? claims : null;
}

/** No expiry: old email links remain valid until their secret/context is retired. */
export function verifyUnsubscribeToken<Field extends string>(token: unknown, config: UnsubscribeConfig<Field>): Record<Field, string> | null {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH || !configured(config)) return null;
    if (!token.startsWith("v2.")) return readLegacy(token, config);
    const parts = token.split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    if (!signatureMatches(parts[2], mac(`v2.${parts[1]}`, derivedKey(config)))) return null;
    const value: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claimsValid(value, config) ? value : null;
  } catch { return null; }
}

function safeUrl(value: string): URL {
  if (/[\s<>]/.test(value)) throw new Error("Invalid unsubscribe URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid unsubscribe URL");
  return url;
}

export function unsubscribeUrl(baseUrl: string, path: string, token: string): string {
  const base = safeUrl(baseUrl);
  if (base.search || !path.startsWith("/") || path.startsWith("//") || /[\\?#\s<>]/.test(path)) throw new Error("Invalid unsubscribe path");
  const url = safeUrl(`${baseUrl.replace(/\/+$/, "")}${path}`);
  url.searchParams.set("t", token);
  return url.toString();
}

export function unsubscribeHeaders(url: string): Record<string, string> {
  safeUrl(url);
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
