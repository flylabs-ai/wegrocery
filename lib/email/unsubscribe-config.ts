import { isNotificationCategory, type NotificationCategory } from "@/lib/notifications/categories";
import {
  signUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  type UnsubscribeConfig,
} from "./unsubscribe";

// One-click unsubscribe (RFC 8058, FlyLabs Playbook 7.6) through FlyLabs Kit
// `email` 2.0 (lib/email/unsubscribe.ts): every notification email carries a
// link signed with a key derived from AUTH_SECRET that turns off the email
// channel of that one category for that one member. No session is needed
// (mail clients POST to it) and no expiry (an old email must still work).
// Links sent before the kit (format `<base64url>.<signature>`, context
// wegrocery-unsubscribe-v1) still verify through `legacy`; rotating
// AUTH_SECRET retires every link, the manage-preferences link in the body
// keeps working.

export const UNSUBSCRIBE_PATH = "/api/unsubscribe";

export function unsubscribeConfig(secret: string): UnsubscribeConfig<"memberId" | "category"> {
  return {
    secret,
    context: "wegrocery/email-unsubscribe/v2",
    fields: ["memberId", "category"],
    categoryField: "category",
    isCategory: isNotificationCategory,
    legacy: { format: "base64-dot", context: "wegrocery-unsubscribe-v1", idField: "memberId" },
  };
}

export function signMemberUnsubscribeToken(memberId: string, category: NotificationCategory, secret: string): string {
  return signUnsubscribeToken({ memberId, category }, unsubscribeConfig(secret));
}

export function verifyMemberUnsubscribeToken(
  token: string,
  secret: string,
): { memberId: string; category: NotificationCategory } | null {
  const claims = verifyUnsubscribeToken(token, unsubscribeConfig(secret));
  if (!claims || !isNotificationCategory(claims.category)) return null;
  return { memberId: claims.memberId, category: claims.category };
}

/**
 * The two headers that make a mail client show an "Unsubscribe" button that
 * works in one click. Null when there is nothing to sign with or link to,
 * or the base URL is not https.
 */
export function memberUnsubscribeHeaders(
  input: { memberId: string; category: NotificationCategory | null },
  baseUrl: string | null,
  secret: string | undefined,
): Record<string, string> | null {
  if (!input.category || !baseUrl || !secret) return null;
  try {
    const token = signMemberUnsubscribeToken(input.memberId, input.category, secret);
    return unsubscribeHeaders(unsubscribeUrl(baseUrl, UNSUBSCRIBE_PATH, token));
  } catch {
    // The kit links only https addresses (local dev runs on http): no button then.
    return null;
  }
}
