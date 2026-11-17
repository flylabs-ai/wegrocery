import type { NeonBranch } from "@/lib/providers/neon";
import type { MigrationStatus } from "./kit/db-migrate.mjs";

// Pure rules of "Migrazioni": which instances the console may migrate, the
// Neon key of each, the backup branch's name and which old backup branches go.

/** From this rollout order on an instance has real members: migrated by hand, with a backup and the operator's ok. */
export const MANUAL_ROLLOUT_ORDER = 1000;
export const BACKUP_PREFIX = "pre-migrate-";

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,62}$/;

/**
 * NEON_FLEET_KEYS: `projectId=key,projectId=key`, each a Neon API key limited
 * to that one project. Malformed entries are dropped; the keys are never
 * returned to a page or logged.
 */
export function parseFleetKeys(raw: string | null | undefined): Map<string, string> {
  const keys = new Map<string, string>();
  for (const part of (raw ?? "").split(/[,\n]/)) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const project = part.slice(0, eq).trim();
    const key = part.slice(eq + 1).trim();
    if (PROJECT_ID.test(project) && /^[A-Za-z0-9_-]{16,200}$/.test(key)) keys.set(project, key);
  }
  return keys;
}

export interface MigrationCandidate {
  id: string;
  name: string;
  status: "provisioning" | "live" | "archived";
  rolloutOrder: number;
  createdAt: Date | string;
  neonProjectId: string | null;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

export function eligibility(i: MigrationCandidate, keys: Map<string, string>): Eligibility {
  if (i.status !== "live") return { ok: false, reason: "non attiva" };
  if (i.rolloutOrder >= MANUAL_ROLLOUT_ORDER) {
    return { ok: false, reason: `ordine di rilascio ${i.rolloutOrder}: soci veri, si migra a mano con backup e ok` };
  }
  if (!i.neonProjectId) return { ok: false, reason: "progetto Neon non indicato nella scheda" };
  if (!keys.has(i.neonProjectId)) return { ok: false, reason: "nessuna chiave in NEON_FLEET_KEYS per il suo progetto" };
  return { ok: true };
}

/** Eligible instances first in rollout order (then creation, then name), the others after with their reason. */
export function migrationPlan<T extends MigrationCandidate>(instances: T[], keys: Map<string, string>) {
  const sorted = [...instances]
    .filter((i) => i.status !== "archived")
    .sort(
      (a, b) =>
        a.rolloutOrder - b.rolloutOrder ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.name.localeCompare(b.name),
    );
  const eligible: T[] = [];
  const manual: { instance: T; reason: string }[] = [];
  for (const i of sorted) {
    const e = eligibility(i, keys);
    if (e.ok) eligible.push(i);
    else manual.push({ instance: i, reason: e.reason });
  }
  return { eligible, manual };
}

export function backupBranchName(sha: string): string {
  return `${BACKUP_PREFIX}${sha.slice(0, 7)}`;
}

/** The production branch: Neon's default one. */
export function productionBranch(branches: NeonBranch[]): NeonBranch | null {
  return branches.find((b) => b.isDefault) ?? null;
}

/** Older backup branches the console made itself (by prefix), never the default, a protected one or `keep`. */
export function staleBackups(branches: NeonBranch[], keepId: string): NeonBranch[] {
  return branches.filter((b) => b.name.startsWith(BACKUP_PREFIX) && b.id !== keepId && !b.isDefault && !b.isProtected);
}

export interface StatusSummary {
  applied: number;
  pending: string[];
  unverified: string[];
  mismatch: string[];
  /** Applied on the database, absent from the commit: an instance ahead of the chosen commit. */
  unknown: string[];
}

export function summarize(status: MigrationStatus[]): StatusSummary {
  const by = (s: MigrationStatus["state"]) => status.filter((f) => f.state === s).map((f) => f.name);
  return {
    applied: by("applied").length,
    pending: by("pending"),
    unverified: by("unverified"),
    mismatch: by("mismatch"),
    unknown: by("missing-local"),
  };
}

/** Why an apply must not start, or null. A checksum mismatch or an instance ahead of the commit stops it. */
export function blocker(s: StatusSummary): string | null {
  if (s.mismatch.length) return `checksum diverso per ${s.mismatch.join(", ")}: un file già applicato è cambiato`;
  if (s.unknown.length) return `il database ha migrazioni che il commit non conosce (${s.unknown.join(", ")}): commit troppo vecchio?`;
  return null;
}

/** After an apply everything must be recorded with its checksum. */
export function fullyApplied(s: StatusSummary): boolean {
  return !s.pending.length && !s.unverified.length && !s.mismatch.length && !s.unknown.length;
}
