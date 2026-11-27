export * from "@/lib/web-push/subscription";

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
