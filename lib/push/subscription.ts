// What a browser hands over when it turns push on (PushSubscription.toJSON()),
// checked before it is stored (PWA spec v1.2, PUSH-05): an endpoint of a
// known push service and the two keys at their exact sizes. Same rules as
// Stellar Reviews (web/lib/notifications/push-endpoint.ts and push.ts):
// keep in sync until the FlyLabs Kit web-push module (A6) takes them over.

const PROVIDERS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export const MAX_ENDPOINT_LENGTH = 2048;

// The raw authority, not URL.hostname: URL drops an explicit :443 and
// normalizes Unicode, escapes and backslashes.
export function pushEndpointHost(endpoint: string): string | null {
  if (endpoint.length > MAX_ENDPOINT_LENGTH || /[\s\x00-\x1f\x7f\\]/.test(endpoint)) return null;
  const host = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(endpoint)?.[1].toLowerCase();
  if (!host || host.length > 253) return null;
  const labels = host.split(".");
  if (labels.some((label) => label.startsWith("xn--") || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return null;
  }
  return PROVIDERS.some((provider) => host === provider || host.endsWith(`.${provider}`)) ? host : null;
}

// base64url of exactly `size` bytes, with or without padding.
export function decodeKey(key: string, size: number): Buffer | null {
  if (key.length !== Math.ceil((size * 4) / 3) && key.length !== Math.ceil(size / 3) * 4) return null;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(key)) return null;
  const bare = key.replace(/=+$/, "");
  const bytes = Buffer.from(bare, "base64url");
  const padding = "=".repeat((4 - (bare.length % 4)) % 4);
  return bytes.length === size && bytes.toString("base64url") === bare && (key === bare || key === bare + padding)
    ? bytes
    : null;
}

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };

export function parseSubscription(input: unknown): SubscriptionInput | null {
  const value = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = value?.endpoint;
  const p256dh = value?.keys?.p256dh;
  const auth = value?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!pushEndpointHost(endpoint) || !decodeKey(p256dh, 65) || !decodeKey(auth, 16)) return null;
  return { endpoint, p256dh, auth };
}

// An endpoint a client presents to ask about or forget its device: the same
// shape check, without the keys.
export function isEndpoint(value: unknown): value is string {
  return typeof value === "string" && pushEndpointHost(value) !== null;
}

// "iPhone", "Chrome · Mac": a short name from the user agent, only to tell
// a person's devices apart (DEV-06). At most 80 characters (migration 0057).
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const os = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  if (os === "iPhone" || os === "iPad") return os;
  return [browser, os].filter(Boolean).join(" · ").slice(0, 80) || null;
}
