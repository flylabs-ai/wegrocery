import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeHeaders, unsubscribeUrl, type UnsubscribeConfig } from "./unsubscribe";

const SECRET = "synthetic-test-secret-".repeat(3);
const category = "updates";
const id = "00000000-0000-4000-8000-000000000001";
const config: UnsubscribeConfig<"memberId" | "category"> = {
  secret: SECRET, context: "example.test/unsubscribe", fields: ["memberId", "category"], categoryField: "category", isCategory: (value) => value === category,
};
const target = { memberId: id, category };
const legacyWg = (memberId: string, value: string) => {
  const payload = Buffer.from(`${memberId}.${value}`).toString("base64url");
  return `${payload}.${createHmac("sha256", `wegrocery-unsubscribe-v1:${SECRET}`).update(payload).digest("base64url")}`;
};
const legacyStellar = (membershipId: string, value: string) => {
  const payload = `${membershipId.toLowerCase()}.${value}`;
  const key = createHmac("sha256", SECRET).update("stellar-reviews/unsubscribe/v1").digest();
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
};

describe("unsubscribe tokens", () => {
  it("signs only the chosen string fields with an HKDF-derived key", () => {
    const withExtra = { ...target, ignored: "not in token" };
    const token = signUnsubscribeToken(withExtra, config);
    const [version, payload, signature] = token.split(".");
    expect(version).toBe("v2");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual(target);
    const key = Buffer.from(hkdfSync("sha256", SECRET, "flylabs-email-unsubscribe-v2", config.context, 32));
    expect(signature).toBe(createHmac("sha256", key).update(`${version}.${payload}`).digest("base64url"));
    expect(verifyUnsubscribeToken(token, config)).toEqual(target);
    expect(verifyUnsubscribeToken(token, { ...config, context: "other-app" })).toBeNull();
    expect(verifyUnsubscribeToken(token, { ...config, secret: "other-secret" })).toBeNull();
  });
  it("handles arbitrary chosen fields without ambiguous dots or Unicode", () => {
    const custom = { ...config, fields: ["memberId", "category", "scope"] as const };
    const claims = { memberId: "member.with.dots", category, scope: "città" };
    expect(verifyUnsubscribeToken(signUnsubscribeToken(claims, custom), custom)).toEqual(claims);
    expect(verifyUnsubscribeToken(signUnsubscribeToken(claims, custom), config)).toBeNull();
  });
  it("accepts WeGrocery's old format only when explicitly enabled", () => {
    const old = legacyWg("member.with.dots", category);
    expect(verifyUnsubscribeToken(old, config)).toBeNull();
    const compatible = { ...config, legacy: { format: "base64-dot" as const, context: "wegrocery-unsubscribe-v1", idField: "memberId" as const } };
    expect(verifyUnsubscribeToken(old, compatible)).toEqual({ memberId: "member.with.dots", category });
    expect(verifyUnsubscribeToken(legacyWg(id, "unknown"), compatible)).toBeNull();
  });
  it("accepts Stellar's old format with its original two-stage HMAC key", () => {
    const stellar: UnsubscribeConfig<"membershipId" | "category"> = {
      ...config, fields: ["membershipId", "category"], categoryField: "category", legacy: { format: "uuid-dot", context: "stellar-reviews/unsubscribe/v1", idField: "membershipId" },
    };
    expect(verifyUnsubscribeToken(legacyStellar(id, category), stellar)).toEqual({ membershipId: id, category });
    expect(verifyUnsubscribeToken(legacyStellar("not-a-uuid", category), stellar)).toBeNull();
    expect(verifyUnsubscribeToken(legacyStellar(id, "unknown"), stellar)).toBeNull();
  });
  it("never signs new tokens with either old key", () => {
    const token = signUnsubscribeToken(target, config);
    const signed = token.slice(0, token.lastIndexOf("."));
    const signature = token.split(".").at(-1);
    for (const key of [`wegrocery-unsubscribe-v1:${SECRET}`, createHmac("sha256", SECRET).update("stellar-reviews/unsubscribe/v1").digest()]) {
      expect(signature).not.toBe(createHmac("sha256", key).update(signed).digest("base64url"));
    }
    expect(token).not.toBe(legacyWg(id, category));
    for (const format of ["base64-dot", "uuid-dot"] as const) {
      expect(signUnsubscribeToken(target, { ...config, legacy: { format, context: "legacy-example", idField: "memberId" } })).toBe(token);
    }
  });
  it("rejects malformed, altered or invalid-category tokens without throwing", () => {
    const token = signUnsubscribeToken(target, config);
    for (const invalid of [undefined, null, 42, "", "x.y", `${token}.extra`, token.replace("v2.", "v3."), `${token.slice(0, -8)}aaaaaaaa`, "x".repeat(9000)]) {
      expect(verifyUnsubscribeToken(invalid, config)).toBeNull();
    }
    expect(verifyUnsubscribeToken(token, { ...config, isCategory: () => false })).toBeNull();
    expect(verifyUnsubscribeToken(token, { ...config, secret: "" })).toBeNull();
    expect(() => signUnsubscribeToken({ ...target, category: "unknown" }, config)).toThrow("Invalid unsubscribe claims");
    expect(() => signUnsubscribeToken(target, { ...config, secret: "" })).toThrow("Invalid unsubscribe configuration");
  });
  it("rejects a correctly signed token whose configured fields do not match", () => {
    const token = signUnsubscribeToken(target, config);
    expect(verifyUnsubscribeToken(token, { ...config, fields: ["memberId"] })).toBeNull();
    expect(verifyUnsubscribeToken(token, { ...config, isCategory: () => { throw new Error("private"); } })).toBeNull();
  });
});
describe("unsubscribe URLs and headers", () => {
  it("builds the caller's HTTPS route and RFC 8058 header pair", () => {
    const url = unsubscribeUrl("https://app.example.com/", "/api/unsubscribe", "a+b/c");
    expect(url).toBe("https://app.example.com/api/unsubscribe?t=a%2Bb%2Fc");
    expect(unsubscribeHeaders(url)).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(unsubscribeUrl("https://app.example.com", "/email/disiscrizione", "token")).toContain("/email/disiscrizione?t=token");
  });
  it("rejects header and URL injection", () => {
    expect(() => unsubscribeHeaders("https://app.example.com/\r\nInjected: value")).toThrow();
    expect(() => unsubscribeUrl("https://app.example.com", "//other.example.test", "token")).toThrow();
    expect(() => unsubscribeHeaders("javascript:alert(1)")).toThrow();
  });
});
