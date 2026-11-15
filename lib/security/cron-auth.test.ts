import { describe, expect, it } from "vitest";
import { cronAuthorized } from "./cron-auth";

const SECRET = "s".repeat(40);
const headers = (h: Record<string, string>) => new Headers(h);

describe("cronAuthorized", () => {
  it("accepts only the bearer of a long enough secret", () => {
    expect(cronAuthorized(headers({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
    expect(cronAuthorized(headers({ authorization: `Bearer ${SECRET}x` }), SECRET)).toBe(false);
    expect(cronAuthorized(headers({ authorization: SECRET }), SECRET)).toBe(false);
    expect(cronAuthorized(headers({}), SECRET)).toBe(false);
  });

  it("ignores spaces around the configured secret", () => {
    expect(cronAuthorized(headers({ authorization: `Bearer ${SECRET}` }), `${SECRET}\n`)).toBe(true);
  });

  it("stays closed without a secret or with a short one", () => {
    expect(cronAuthorized(headers({ authorization: "Bearer " }), undefined)).toBe(false);
    expect(cronAuthorized(headers({ authorization: "Bearer " }), "")).toBe(false);
    expect(cronAuthorized(headers({ authorization: "Bearer short" }), "short")).toBe(false);
    expect(cronAuthorized(headers({ authorization: "Bearer short" }), "short", { minLength: 5 })).toBe(true);
  });

  it("reads x-cron-secret only when the app turns it on", () => {
    const h = headers({ "x-cron-secret": SECRET });
    expect(cronAuthorized(h, SECRET)).toBe(false);
    expect(cronAuthorized(h, SECRET, { allowSecretHeader: true })).toBe(true);
    expect(cronAuthorized(headers({ "x-cron-secret": "wrong" }), SECRET, { allowSecretHeader: true })).toBe(false);
  });
});
