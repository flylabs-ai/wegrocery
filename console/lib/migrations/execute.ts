import { fetchWithTimeout, readJson, type FetchLike } from "@/lib/http";
import { DEFAULT_DATABASE, DEFAULT_ROLE, neonClient, type NeonClient } from "@/lib/providers/neon";
import { APP_ROLE } from "@/lib/provisioning/app-role";
import { baseUrl } from "@/lib/stats/probe";
import { parseHealth } from "@/lib/stats/types";
import { MigrationError } from "./kit/db-migrate-lib.mjs";
import { createNeonClient, runMigrations, type ConnectedClient } from "./kit/db-migrate.mjs";
import type { MigrationBundle } from "./source";
import {
  backupBranchName,
  blocker,
  fullyApplied,
  productionBranch,
  staleBackups,
  summarize,
  type StatusSummary,
} from "./plan";

// One instance, one commit: preview (read only) or backup + apply + verify.
// The owner's connection string is asked of Neon here, used, and dropped: it
// is never returned, stored or logged. Errors carry fixed texts, Neon's own
// message or a SQLSTATE, never SQL or a connection string.

export interface ExecTarget {
  name: string;
  url: string;
  neonProjectId: string;
  neonOwnerRole: string | null;
  neonDatabase: string | null;
}

export interface ExecDeps {
  apiKey: string;
  neon?: NeonClient;
  connect?: (connectionString: string) => Promise<ConnectedClient>;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export interface PreviewResult {
  summary: StatusSummary;
  blocker: string | null;
}

export interface ApplyResult {
  before: StatusSummary;
  applied: string[];
  backfilled: string[];
  backupBranch: string;
  warnings: string[];
}

const OPERATION_WAIT_MS = 30_000;
const OPERATION_POLL_MS = 1_000;

async function withDatabase<T>(t: ExecTarget, deps: ExecDeps, work: (client: ConnectedClient, neon: NeonClient, productionId: string) => Promise<T>): Promise<T> {
  const neon = deps.neon ?? neonClient({ apiKey: deps.apiKey, fetchImpl: deps.fetchImpl });
  const production = productionBranch(await neon.listBranches(t.neonProjectId));
  if (!production) throw new MigrationError("Neon non indica il ramo di produzione del progetto");
  const connection = await neon.connectionUri(t.neonProjectId, {
    branchId: production.id,
    role: t.neonOwnerRole ?? DEFAULT_ROLE,
    database: t.neonDatabase ?? DEFAULT_DATABASE,
    pooled: false,
  });
  const client = await (deps.connect ?? createNeonClient)(connection);
  let result: T;
  try {
    await client.connect();
    result = await work(client, neon, production.id);
  } finally {
    try {
      await client.end();
    } catch {
      // The outcome is already decided; a failed close only leaks an idle socket.
    }
  }
  return result;
}

export async function previewInstance(t: ExecTarget, bundle: MigrationBundle, deps: ExecDeps): Promise<PreviewResult> {
  return withDatabase(t, deps, async (client) => {
    const r = await runMigrations(client, bundle.files, { mode: "dry-run", requireExistingLedger: true });
    const summary = summarize(r.status);
    return { summary, blocker: blocker(summary) };
  });
}

async function waitForOperations(neon: NeonClient, projectId: string, ids: string[], sleep: (ms: number) => Promise<void>) {
  const deadline = Date.now() + OPERATION_WAIT_MS;
  for (const id of ids) {
    for (;;) {
      const status = await neon.operationStatus(projectId, id);
      if (status === "finished" || status === "skipped") break;
      if (status === "failed" || status === "error" || status === "cancelled") throw new MigrationError("Neon non ha creato il ramo di backup");
      if (Date.now() > deadline) throw new MigrationError("Il ramo di backup non è pronto dopo 30 secondi: riprova");
      await sleep(OPERATION_POLL_MS);
    }
  }
}

export async function applyInstance(t: ExecTarget, bundle: MigrationBundle, deps: ExecDeps): Promise<ApplyResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return withDatabase(t, deps, async (client, neon, productionId) => {
    // 1. Read only: the plan, checksums and pending SQL are checked before any write.
    const preview = await runMigrations(client, bundle.files, { mode: "dry-run", requireExistingLedger: true });
    const before = summarize(preview.status);
    const stop = blocker(before);
    if (stop) throw new MigrationError(`Fermato prima di scrivere: ${stop}`);

    // 2. Backup: a copy-on-write branch of production at this instant. A run
    // again on the same commit keeps the first backup (taken before any try).
    const name = backupBranchName(bundle.sha);
    const branches = await neon.listBranches(t.neonProjectId);
    let backup = branches.find((b) => b.name === name);
    if (!backup) {
      const created = await neon.createBranch(t.neonProjectId, { name, parentId: productionId });
      await waitForOperations(neon, t.neonProjectId, created.operationIds, sleep);
      backup = created.branch;
    }

    // 3. Apply: one transaction per file, advisory lock, checksums, the app role kept off the ledger.
    const r = await runMigrations(client, bundle.files, { mode: "apply", requireExistingLedger: true, appRole: APP_ROLE });

    // 4. Verify: everything in the commit recorded with its checksum.
    const after = summarize(r.status);
    if (!fullyApplied(after)) throw new MigrationError("Dopo l'applicazione il registro non torna: controlla l'anteprima");

    const warnings: string[] = [];
    for (const old of staleBackups(await neon.listBranches(t.neonProjectId), backup.id)) {
      try {
        await neon.deleteBranch(t.neonProjectId, old.id);
      } catch {
        warnings.push(`ramo di backup ${old.name} non cancellato`);
      }
    }

    const health = await checkHealth(t.url, deps.fetchImpl ?? fetch);
    if (health) warnings.push(health);
    return { before, applied: r.applied, backfilled: r.backfilled, backupBranch: backup.name, warnings };
  });
}

/** Null when /api/health answers ok with the database; otherwise what it said. */
export async function checkHealth(url: string, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(fetchImpl, `${baseUrl(url)}/api/health`);
    const h = parseHealth(await readJson(res));
    if (!h) return `health: risposta non valida (HTTP ${res.status})`;
    return h.ok && h.db ? null : "health: l'istanza non risponde ok col database";
  } catch {
    return "health: non raggiungibile";
  }
}
