// /api/health, the shape every FlyLabs app answers (Playbook 7.1,
// flylabs-kit registry/console): whether the app is up, which release is
// live and whether the database answers. An app may add fields of its own
// (Stellar adds commit); these three are what the Console reads.
export type Health = { ok: boolean; version: string; commit?: string; db: boolean };
export type HealthOptions = { version: string; commit?: string; timeoutMs?: number };

// A database that hangs is as down as one that refuses: past the timeout the
// probe counts as failed, so the monitor gets an answer within its own limit.
export const PROBE_TIMEOUT_MS = 3_000;

// version: the app's release (its changelog or package.json), never the
// commit alone.
export function appCommit(env: Record<string, string | undefined>): string {
  return env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local";
}

export function checkHealth(probe: () => PromiseLike<unknown>, options: HealthOptions): Promise<Health>;
/** @deprecated Pass { version, commit?, timeoutMs? } instead. */
export function checkHealth(probe: () => PromiseLike<unknown>, version: string, timeoutMs?: number): Promise<Health>;
export async function checkHealth(probe: () => PromiseLike<unknown>, options: HealthOptions | string, legacyTimeout = PROBE_TIMEOUT_MS): Promise<Health> {
  const { version, commit, timeoutMs = PROBE_TIMEOUT_MS } = typeof options === "string" ? { version: options, timeoutMs: legacyTimeout } : options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  let db = true;
  try {
    db = await Promise.race([Promise.resolve(probe()).then(() => true), timeout]);
  } catch {
    db = false;
  } finally {
    clearTimeout(timer);
  }
  return { ok: db, version, ...(commit !== undefined ? { commit } : {}), db };
}

export function healthResponse(health: Health): Response {
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
