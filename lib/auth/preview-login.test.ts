import { describe, expect, it } from "vitest";
import { isPublicAuthEndpoint } from "./public-endpoints";
import { previewLoginConfig, secretMatches } from "./preview-login";

const SECRET = "s".repeat(32);
const ready = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  PREVIEW_LOGIN_SECRET: SECRET,
  PREVIEW_LOGIN_EMAILS: "Prova.Socio@example.com, prova.admin@example.com",
};

describe("previewLoginConfig", () => {
  it("is on only on a Vercel preview with a long secret and two test addresses", () => {
    expect(previewLoginConfig(ready)).toEqual({
      secret: SECRET,
      emails: { user: "prova.socio@example.com", admin: "prova.admin@example.com" },
    });
  });

  it.each([
    ["production", { ...ready, VERCEL_ENV: "production" }],
    ["a local machine", { ...ready, VERCEL_ENV: undefined, NODE_ENV: "development" }],
    ["the demo", { ...ready, DEMO_MODE: "true" }],
    ["no secret", { ...ready, PREVIEW_LOGIN_SECRET: undefined }],
    ["a short secret", { ...ready, PREVIEW_LOGIN_SECRET: "s".repeat(31) }],
    ["no addresses", { ...ready, PREVIEW_LOGIN_EMAILS: undefined }],
    ["one address", { ...ready, PREVIEW_LOGIN_EMAILS: "prova.socio@example.com" }],
    ["three addresses", { ...ready, PREVIEW_LOGIN_EMAILS: "a@example.com,b@example.com,c@example.com" }],
    ["the same address twice", { ...ready, PREVIEW_LOGIN_EMAILS: "a@example.com,A@example.com" }],
    ["a real domain", { ...ready, PREVIEW_LOGIN_EMAILS: "socio@gmail.com,prova.admin@example.com" }],
    ["a look-alike domain", { ...ready, PREVIEW_LOGIN_EMAILS: "a@example.com.evil.it,b@example.com" }],
    ["two @", { ...ready, PREVIEW_LOGIN_EMAILS: "a@gmail.com@example.com,b@example.com" }],
  ])("is off with %s", (_case, env) => {
    expect(previewLoginConfig(env)).toBeNull();
  });

  it("opens its endpoint only when it is on", () => {
    expect(isPublicAuthEndpoint("POST", "/api/auth/preview/sign-in", ready)).toBe(true);
    expect(isPublicAuthEndpoint("POST", "/api/auth/preview/sign-in", { ...ready, VERCEL_ENV: "production" })).toBe(false);
    expect(isPublicAuthEndpoint("POST", "/api/auth/preview/sign-in", {})).toBe(false);
    expect(isPublicAuthEndpoint("GET", "/api/auth/preview/sign-in", ready)).toBe(false);
  });
});

describe("secretMatches", () => {
  it("accepts only the exact secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(`${SECRET} `, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
    expect(secretMatches(null, SECRET)).toBe(false);
  });
});
