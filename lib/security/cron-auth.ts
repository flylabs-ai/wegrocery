import { MIN_SECRET_LENGTH, secretUsable, timingSafeEqualString } from "./secrets";

// Who may call a cron route: whoever carries CRON_SECRET. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`; a GitHub workflow may send it in
// `x-cron-secret` instead, when the app turns that header on. Without a secret
// of at least `minLength` characters the routes stay closed.

export interface CronAuthOptions {
  /** Also accept the secret in `x-cron-secret` (Stellar's GitHub workflows). Default false. */
  allowSecretHeader?: boolean;
  /** Default MIN_SECRET_LENGTH (32). */
  minLength?: number;
}

type HeaderSource = { get(name: string): string | null };

export function cronAuthorized(
  headers: HeaderSource,
  secret: string | null | undefined,
  { allowSecretHeader = false, minLength = MIN_SECRET_LENGTH }: CronAuthOptions = {},
): boolean {
  if (!secretUsable(secret, minLength)) return false;
  const key = secret!.trim();
  // Both comparisons always run, so the time does not say which header was tried.
  const bearer = timingSafeEqualString(headers.get("authorization"), `Bearer ${key}`);
  const header = allowSecretHeader && timingSafeEqualString(headers.get("x-cron-secret"), key);
  return bearer || header;
}
