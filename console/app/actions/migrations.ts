"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertOperator } from "@/lib/auth/session";
import { getDb, newId } from "@/lib/db/client";
import { audit, getInstance, listInstancesWithLatest } from "@/lib/db/queries";
import { migrationRuns, type Instance } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { applyInstance, previewInstance, type ExecTarget } from "@/lib/migrations/execute";
import { eligibility, migrationPlan, parseFleetKeys, type StatusSummary } from "@/lib/migrations/plan";
import { githubSource, type MigrationBundle } from "@/lib/migrations/source";
import { reportError, userMessage } from "@/lib/report-error";

// "Migrazioni": the browser drives the fleet one short action at a time (as
// "Aggiorna flotta" does), so no request outlives a function timeout. Each
// action checks the session and the instance's eligibility again.

type Fail = { ok: false; error: string };

/** MigrationError and SourceError carry fixed texts (file names, SQLSTATE), never SQL or secrets. */
function fail(where: string, e: unknown): Fail {
  reportError(where, e);
  if (e instanceof Error && (e.name === "MigrationError" || e.name === "SourceError")) return { ok: false, error: e.message };
  return { ok: false, error: userMessage(e) };
}

// A commit's files never change: keep the last few bundles of this warm function.
const bundles = new Map<string, MigrationBundle>();

async function loadBundle(ref: string): Promise<MigrationBundle> {
  const cached = bundles.get(ref);
  if (cached) return cached;
  const bundle = await githubSource({ repo: env.repo(), token: env.githubToken() }).load(ref);
  if (bundles.size >= 4) bundles.delete(bundles.keys().next().value!);
  bundles.set(bundle.sha, bundle);
  return bundle;
}

function target(i: Instance): ExecTarget {
  return { name: i.name, url: i.url, neonProjectId: i.neonProjectId!, neonOwnerRole: i.neonOwnerRole, neonDatabase: i.neonDatabase };
}

async function eligibleInstance(instanceId: string): Promise<{ instance: Instance; apiKey: string }> {
  const instance = await getInstance(instanceId);
  if (!instance) throw Object.assign(new Error("Istanza non trovata."), { name: "SourceError" });
  const keys = parseFleetKeys(env.neonFleetKeys());
  const e = eligibility(instance, keys);
  if (!e.ok) throw Object.assign(new Error(`${instance.name}: ${e.reason}.`), { name: "SourceError" });
  return { instance, apiKey: keys.get(instance.neonProjectId!)! };
}

export interface PlanResult {
  ok: true;
  sha: string;
  branch: string;
  files: number;
  latest: string;
  eligible: { id: string; name: string }[];
  manual: { id: string; name: string; reason: string }[];
}

/** The commit (checked on staging/main), its files and which instances the console may migrate. */
export async function migrationPlanAction(ref: string): Promise<PlanResult | Fail> {
  try {
    await assertOperator();
    const bundle = await loadBundle(ref.trim() || "staging");
    const rows = await listInstancesWithLatest(false);
    const plan = migrationPlan(rows.map((r) => r.instance), parseFleetKeys(env.neonFleetKeys()));
    return {
      ok: true,
      sha: bundle.sha,
      branch: bundle.branch,
      files: bundle.files.length,
      latest: bundle.files.at(-1)?.name ?? "",
      eligible: plan.eligible.map((i) => ({ id: i.id, name: i.name })),
      manual: plan.manual.map((m) => ({ id: m.instance.id, name: m.instance.name, reason: m.reason })),
    };
  } catch (e) {
    return fail("migration_plan", e);
  }
}

/** Read only: what is applied, pending or different on one instance. */
export async function migrationPreviewAction(instanceId: string, sha: string): Promise<{ ok: true; summary: StatusSummary; blocker: string | null } | Fail> {
  try {
    await assertOperator();
    const { instance, apiKey } = await eligibleInstance(instanceId);
    const bundle = await loadBundle(sha);
    return { ok: true, ...(await previewInstance(target(instance), bundle, { apiKey })) };
  } catch (e) {
    return fail("migration_preview", e);
  }
}

export interface ApplyActionResult {
  ok: true;
  applied: string[];
  backupBranch: string;
  warnings: string[];
}

/** Backup branch, apply, verify. Recorded in migration_runs and the audit log by name only. */
export async function migrationApplyAction(instanceId: string, sha: string): Promise<ApplyActionResult | Fail> {
  let runId: string | null = null;
  try {
    await assertOperator();
    const { instance, apiKey } = await eligibleInstance(instanceId);
    const bundle = await loadBundle(sha);
    runId = newId("mig");
    await getDb().insert(migrationRuns).values({ id: runId, instanceId, commitSha: bundle.sha, branch: bundle.branch });
    await audit("migration_start", instanceId, `commit ${bundle.sha.slice(0, 7)} (${bundle.branch})`);

    const r = await applyInstance(target(instance), bundle, { apiKey });

    await getDb()
      .update(migrationRuns)
      .set({ status: "done", applied: r.applied, backupBranch: r.backupBranch, error: r.warnings.join("; ") || null, finishedAt: new Date() })
      .where(eq(migrationRuns.id, runId));
    await audit(
      "migration_done",
      instanceId,
      `commit ${bundle.sha.slice(0, 7)}, applicate: ${r.applied.join(", ") || "nessuna"}, backup ${r.backupBranch}${r.warnings.length ? `; ${r.warnings.join("; ")}` : ""}`,
    );
    revalidatePath("/migrazioni");
    revalidatePath(`/istanze/${instanceId}`);
    return { ok: true, applied: r.applied, backupBranch: r.backupBranch, warnings: r.warnings };
  } catch (e) {
    const result = fail("migration_apply", e);
    if (runId) {
      try {
        await getDb().update(migrationRuns).set({ status: "failed", error: result.error.slice(0, 500), finishedAt: new Date() }).where(eq(migrationRuns.id, runId));
        await audit("migration_failed", instanceId, result.error);
      } catch (inner) {
        reportError("migration_record", inner);
      }
    }
    revalidatePath("/migrazioni");
    return result;
  }
}
