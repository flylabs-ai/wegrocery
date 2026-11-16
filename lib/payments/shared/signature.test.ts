import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./signature";

const nowSeconds = 1700000000;
const secret = "whsec_" + "synthetic_" + "x".repeat(32);
const event = { id: "evt_example", type: "example.updated", livemode: false, created: nowSeconds - 100, data: { object: { extra: true } } };
const payload = JSON.stringify(event);
const sign = (body = payload, timestamp = String(nowSeconds)) => `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
const verify = (body = payload, header: string | null = sign(), clock = nowSeconds) => verifyStripeSignature(body, header, secret, { nowSeconds: clock });

describe("raw Stripe webhook signatures", () => {
  it("verifies the fixed synthetic vector without changing the payload", () => {
    expect(verify()).toEqual(event);
    expect(verify(payload + " ")).toBeNull();
  });
  it("accepts any matching v1 during rotation and ignores unknown schemes", () => {
    expect(verify(payload, `v0=ignored,${sign()},v1=${"0".repeat(64)},destination=ignored`)).toEqual(event);
    expect(verify(payload, `t=${nowSeconds},v1=${"0".repeat(64)},${sign().split(",")[1]}`)).toEqual(event);
  });
  it.each([null, "", "t=invalid,v1=bad", `t=${nowSeconds}`, `t=${nowSeconds},v0=bad`, `t=${nowSeconds},v1=${"0".repeat(64)}`, `t=${nowSeconds},t=${nowSeconds},v1=bad`, `t=${nowSeconds}=extra,v1=bad`])("refuses malformed or incorrect headers: %s", (header) => {
    expect(verify(payload, header)).toBeNull();
  });
  it("bounds age in both directions and rejects invalid clock/tolerance", () => {
    expect(verify(payload, sign(), nowSeconds + 300)).toEqual(event);
    expect(verify(payload, sign(), nowSeconds - 300)).toEqual(event);
    expect(verify(payload, sign(), nowSeconds + 301)).toBeNull();
    expect(verify(payload, sign(), nowSeconds - 301)).toBeNull();
    for (const toleranceSeconds of [0, -1, NaN, Infinity]) expect(verifyStripeSignature(payload, sign(), secret, { nowSeconds, toleranceSeconds })).toBeNull();
    expect(verify(payload, sign(), NaN)).toBeNull();
    expect(verifyStripeSignature(payload, sign(), "", { nowSeconds })).toBeNull();
  });
  it("rejects authenticated malformed events, without exposing their contents", () => {
    for (const value of [null, [], {}, { ...event, id: "" }, { ...event, livemode: undefined }, { ...event, created: 1.5 }, { ...event, data: {} }]) {
      const body = JSON.stringify(value);
      expect(verify(body, sign(body))).toBeNull();
    }
    expect(verify("not JSON", sign("not JSON"))).toBeNull();
  });
});
