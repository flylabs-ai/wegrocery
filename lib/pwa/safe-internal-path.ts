export function parseInternalPath(value: unknown, base = "https://app.invalid"): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    return new URL(value, base).origin === base ? value : null;
  } catch {
    return null;
  }
}

export function safeInternalPath(value: unknown, base?: string): string {
  return parseInternalPath(value, base) ?? "/";
}
