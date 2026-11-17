"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { migrationApplyAction, migrationPlanAction, migrationPreviewAction, type PlanResult } from "@/app/actions/migrations";
import { Badge, Button, Card, Field, Input, Notice, SectionTitle, type Tone } from "@/components/ui";
import type { StatusSummary } from "@/lib/migrations/plan";

type Phase = "waiting" | "previewing" | "ready" | "nothing" | "blocked" | "applying" | "done" | "failed";

interface Row {
  id: string;
  name: string;
  phase: Phase;
  summary?: StatusSummary;
  message?: string;
}

const PHASE: Record<Phase, { label: string; tone: Tone }> = {
  waiting: { label: "In attesa", tone: "neutral" },
  previewing: { label: "Anteprima…", tone: "warn" },
  ready: { label: "Da migrare", tone: "warn" },
  nothing: { label: "Già a posto", tone: "ok" },
  blocked: { label: "Bloccata", tone: "danger" },
  applying: { label: "Migrazione…", tone: "warn" },
  done: { label: "Fatta", tone: "ok" },
  failed: { label: "Fallita", tone: "danger" },
};

function describe(s: StatusSummary): string {
  const parts = [`${s.applied} applicate`];
  if (s.pending.length) parts.push(`in sospeso: ${s.pending.join(", ")}`);
  if (s.unverified.length) parts.push(`${s.unverified.length} senza checksum (verrà aggiunto)`);
  return parts.join("; ");
}

/** Preview every eligible instance, then migrate them one at a time, stopping at the first failure. */
export function FleetMigrations() {
  const router = useRouter();
  const [ref, setRef] = useState("staging");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const list = useRef<Row[]>([]);

  const update = (id: string, patch: Partial<Row>) => {
    list.current = list.current.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setRows(list.current);
  };

  async function preview() {
    setError(null);
    setBusy(true);
    cancelled.current = false;
    try {
      const p = await migrationPlanAction(ref);
      if (!p.ok) return setError(p.error);
      setPlan(p);
      list.current = p.eligible.map((i) => ({ id: i.id, name: i.name, phase: "waiting" }));
      setRows(list.current);
      for (const row of p.eligible) {
        if (cancelled.current) break;
        update(row.id, { phase: "previewing", message: undefined });
        const r = await migrationPreviewAction(row.id, p.sha);
        if (!r.ok) update(row.id, { phase: "failed", message: r.error });
        else if (r.blocker) update(row.id, { phase: "blocked", summary: r.summary, message: r.blocker });
        else {
          const todo = r.summary.pending.length + r.summary.unverified.length;
          update(row.id, { phase: todo ? "ready" : "nothing", summary: r.summary, message: describe(r.summary) });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function apply(ids: string[]) {
    if (!plan) return;
    const names = ids.map((id, n) => `${n + 1}. ${list.current.find((r) => r.id === id)?.name}`).join("\n");
    const confirmText =
      `Migrare al commit ${plan.sha.slice(0, 7)} (${plan.branch}) queste istanze, una alla volta?\n\n${names}\n\n` +
      "Prima di ognuna viene creato un ramo Neon di backup. Ci si ferma al primo errore.";
    if (!window.confirm(confirmText)) return;
    setError(null);
    setBusy(true);
    cancelled.current = false;
    try {
      for (const id of ids) {
        if (cancelled.current) break;
        update(id, { phase: "applying", message: "Backup, applicazione e verifica…" });
        const r = await migrationApplyAction(id, plan.sha);
        if (!r.ok) {
          update(id, { phase: "failed", message: r.error });
          setError("Fermato: le istanze successive non sono state toccate.");
          break;
        }
        const applied = r.applied.length ? `applicate ${r.applied.join(", ")}` : "niente da applicare";
        update(id, { phase: "done", message: `${applied}; backup ${r.backupBranch}${r.warnings.length ? `; ${r.warnings.join("; ")}` : ""}` });
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const blocked = rows.some((r) => r.phase === "blocked" || r.phase === "failed");
  const previewed = rows.length > 0 && rows.every((r) => r.phase !== "waiting" && r.phase !== "previewing");
  const canApply = (r: Row) => r.phase === "ready" || r.phase === "nothing";

  return (
    <Card>
      <SectionTitle>Migra la flotta</SectionTitle>
      <p className="mb-3 text-sm text-muted">
        Prende i file <span className="font-mono">drizzle/</span> di un commit che sta su staging o main, mostra cosa manca a ogni istanza, poi
        migra una istanza alla volta in ordine di rilascio, ognuna dopo un ramo Neon di backup. Le istanze con soci veri (ordine 1000 o più) si
        migrano a mano.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Commit, ramo o tag" htmlFor="migration-ref" hint="Di solito staging, prima del merge su main.">
          <Input id="migration-ref" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" disabled={busy} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {busy ? (
            <Button variant="danger" onClick={() => (cancelled.current = true)}>
              Interrompi dopo questa
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={preview}>
                Anteprima
              </Button>
              <Button
                variant="primary"
                disabled={!previewed || blocked || !rows.some(canApply)}
                onClick={() => apply(rows.filter(canApply).map((r) => r.id))}
              >
                Migra flotta
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      {plan && (
        <p className="mt-3 text-sm text-muted">
          Commit <span className="font-mono">{plan.sha.slice(0, 7)}</span> su {plan.branch}: {plan.files} migrazioni, l&apos;ultima{" "}
          <span className="font-mono">{plan.latest}</span>.
        </p>
      )}
      {rows.length > 0 && (
        <ol className="mt-3 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="font-medium sm:w-48">{r.name}</span>
              <Badge tone={PHASE[r.phase].tone}>{PHASE[r.phase].label}</Badge>
              {r.message && <span className="flex-1 break-words text-muted">{r.message}</span>}
              {!busy && canApply(r) && (
                <Button variant="ghost" onClick={() => apply([r.id])}>
                  Migra solo questa
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {plan && plan.manual.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Escluse</p>
          <ul className="mt-1 text-sm text-muted">
            {plan.manual.map((m) => (
              <li key={m.id}>
                {m.name}: {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
