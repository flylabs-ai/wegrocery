import type { Metadata } from "next";
import Link from "next/link";
import { FleetMigrations } from "@/components/fleet-migrations";
import { Shell } from "@/components/shell";
import { Badge, Card, Notice, PageTitle, SectionTitle, type Tone } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { listInstancesWithLatest, listMigrationRuns } from "@/lib/db/queries";
import type { MigrationRun } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parseFleetKeys } from "@/lib/migrations/plan";
import { reportError } from "@/lib/report-error";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Migrazioni" };
// The apply action runs on this route: a backup branch, the files and the health check.
export const maxDuration = 300;

const RUN: Record<MigrationRun["status"], { label: string; tone: Tone }> = {
  running: { label: "In corso", tone: "warn" },
  done: { label: "Fatta", tone: "ok" },
  failed: { label: "Fallita", tone: "danger" },
};

export default async function MigrationsPage() {
  await requireOperator();
  let runs: MigrationRun[] = [];
  let names = new Map<string, string>();
  let loadError = false;
  try {
    const [r, rows] = await Promise.all([listMigrationRuns(null, 30), listInstancesWithLatest(true)]);
    runs = r;
    names = new Map(rows.map((x) => [x.instance.id, x.instance.name]));
  } catch (e) {
    reportError("migrations_page", e);
    loadError = true;
  }
  const keyCount = parseFleetKeys(env.neonFleetKeys()).size;

  return (
    <Shell current="/migrazioni">
      <PageTitle
        title="Migrazioni"
        subtitle="Applica le migrazioni di un commit di staging o main ai database della flotta, prima del deploy."
      />
      {keyCount === 0 && (
        <Notice tone="warn" className="mb-4">
          NEON_FLEET_KEYS non è impostata: nessuna istanza si può migrare da qui. Serve una chiave API Neon limitata al progetto per ogni
          istanza (formato <span className="font-mono">idprogetto=chiave,…</span>), e l&apos;id del progetto nella scheda dell&apos;istanza.
        </Notice>
      )}
      <FleetMigrations />

      <Card className="mt-6">
        <SectionTitle>Ultime esecuzioni</SectionTitle>
        {loadError && <Notice tone="danger">Registro non leggibile.</Notice>}
        {!loadError && runs.length === 0 && <p className="text-sm text-muted">Nessuna esecuzione.</p>}
        {runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Quando</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Istanza</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Commit</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Esito</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Applicate</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Backup</th>
                  <th scope="col" className="py-1 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                    <td className="py-1 pr-3">
                      <Link className="underline-offset-2 hover:underline" href={`/istanze/${r.instanceId}`}>
                        {names.get(r.instanceId) ?? r.instanceId}
                      </Link>
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs">
                      {r.commitSha.slice(0, 7)} ({r.branch})
                    </td>
                    <td className="py-1 pr-3">
                      <Badge tone={RUN[r.status].tone}>{RUN[r.status].label}</Badge>
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs">{r.applied.length ? r.applied.join(", ") : "nessuna"}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{r.backupBranch ?? ""}</td>
                    <td className="py-1 text-xs text-muted">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
