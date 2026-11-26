import { describe, expect, it } from "vitest";
import { decodeKey, deviceLabel, isEndpoint, parseSubscription, pushEndpointHost } from "./subscription";

const keys = { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") };

describe("pushEndpointHost (PUSH-05)", () => {
  it("accepts the known push services and their subdomains", () => {
    expect(pushEndpointHost("https://fcm.googleapis.com/fcm/send/x")).toBe("fcm.googleapis.com");
    expect(pushEndpointHost("https://web.push.apple.com/abc")).toBe("web.push.apple.com");
    expect(pushEndpointHost("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe("updates.push.services.mozilla.com");
    expect(pushEndpointHost("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe("wns2-par02p.notify.windows.com");
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com:443/x",
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://xn--fcm-googleapis.com/x",
    "https://fcm.googleapis.com\\@evil.example/x",
    "https://fcm.googleapis.com/x y",
    `https://fcm.googleapis.com/${"a".repeat(2048)}`,
  ])("rejects %s", (endpoint) => {
    expect(pushEndpointHost(endpoint)).toBeNull();
    expect(isEndpoint(endpoint)).toBe(false);
  });
});

describe("decodeKey", () => {
  it("accepts the exact size with or without padding", () => {
    expect(decodeKey(keys.p256dh, 65)?.length).toBe(65);
    expect(decodeKey(`${keys.auth}==`, 16)?.length).toBe(16);
  });

  it("rejects wrong sizes and alphabets", () => {
    expect(decodeKey(keys.auth, 65)).toBeNull();
    expect(decodeKey(keys.p256dh.replace(/.$/, "+"), 65)).toBeNull();
    expect(decodeKey(`${keys.auth}=`, 16)).toBeNull();
  });
});

describe("parseSubscription", () => {
  it("returns endpoint and keys for a valid subscription", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect(parseSubscription({ endpoint, keys })).toEqual({ endpoint, ...keys });
  });

  it.each([null, {}, { endpoint: "https://evil.example/x", keys }, { endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "x" } }])(
    "rejects %j",
    (input) => expect(parseSubscription(input)).toBeNull(),
  );
});

describe("deviceLabel", () => {
  it("names the device briefly", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36")).toBe("Chrome · Mac");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15) Chrome/141.0 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(deviceLabel(null)).toBeNull();
  });
});
