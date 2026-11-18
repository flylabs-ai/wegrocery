import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NeonBranch, NeonClient } from "@/lib/providers/neon";
import type { MigrationBundle } from "./source";

// The kit runner is tested in the kit and the app; here only the console's
// sequence around it: read-only first, backup before any write, verify, clean up.
const runMigrations = vi.fn();
vi.mock("./kit/db-migrate.mjs", () => ({ runMigrations: (...a: unknown[]) => runMigrations(...a), createNeonClient: vi.fn() }));

const { applyInstance, previewInstance } = await import("./execute");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const bundle: MigrationBundle = { sha: SHA, branch: "staging", files: [{ name: "0001_a.sql", sql: "SELECT 1;" }] };
const target = { name: "Demo", url: "https://demo.example", neonProjectId: "flat-river-1", neonOwnerRole: null, neonDatabase: null };
const st = (state: string) => ({ status: [{ name: "0001_a.sql", state, checksum: null, recordedChecksum: null }], applied: [], skipped: [], backfilled: [] });

function fakeNeon(branches: NeonBranch[]) {
  const log: string[] = [];
  const list = [...branches];
  const neon = {
    listBranches: vi.fn(async () => {
      log.push("list");
      return [...list];
    }),
    connectionUri: vi.fn(async (_p: string, o: Record<string, unknown>) => {
      log.push(`uri ${o.branchId} ${o.role} ${o.database} pooled=${o.pooled}`);
      return "postgresql://owner:pw@ep-x.neon.tech/neondb";
    }),
    createBranch: vi.fn(async (_p: string, i: { name: string; parentId: string }) => {
      log.push(`create ${i.name} from ${i.parentId}`);
      const b = { id: "br-new", name: i.name, parentId: i.parentId, isDefault: false, isProtected: false };
      list.push(b);
      return { branch: b, operationIds: ["op-1"] };
    }),
    operationStatus: vi.fn(async () => "finished"),
    deleteBranch: vi.fn(async (_p: string, id: string) => {
      log.push(`delete ${id}`);
    }),
  } as unknown as NeonClient;
  return { neon, log };
}

const client = () => {
  const c = { connect: vi.fn(async () => {}), end: vi.fn(async () => {}), query: vi.fn() };
  return c;
};
const healthy = (async () => new Response(JSON.stringify({ ok: true, db: true, version: "1.51.0" }))) as never;
const prod: NeonBranch = { id: "br-prod", name: "production", parentId: null, isDefault: true, isProtected: false };

beforeEach(() => {
  runMigrations.mockReset();
});

describe("previewInstance", () => {
  it("connects as the owner, unpooled, to the default branch and only reads", async () => {
    const { neon, log } = fakeNeon([prod]);
    const c = client();
    runMigrations.mockResolvedValueOnce(st("pending"));
    const r = await previewInstance(target, bundle, { apiKey: "k", neon, connect: async () => c });
    expect(log).toContain("uri br-prod neondb_owner neondb pooled=false");
    expect(runMigrations.mock.calls[0][2]).toMatchObject({ mode: "dry-run", requireExistingLedger: true });
    expect(r.summary.pending).toEqual(["0001_a.sql"]);
    expect(r.blocker).toBeNull();
    expect(c.end).toHaveBeenCalled();
    expect(log.some((l) => l.startsWith("create"))).toBe(false);
  });
});

describe("applyInstance", () => {
  it("makes the backup branch before applying, verifies, removes older backups", async () => {
    const old: NeonBranch = { id: "br-old", name: "pre-migrate-fffffff", parentId: "br-prod", isDefault: false, isProtected: false };
    const { neon, log } = fakeNeon([prod, old]);
    const order: string[] = [];
    runMigrations.mockImplementation(async (_c, _f, o: { mode: string }) => {
      order.push(`${o.mode} after ${log.filter((l) => l.startsWith("create")).length} backup`);
      return o.mode === "apply" ? { ...st("applied"), applied: ["0001_a.sql"] } : st("pending");
    });
    const r = await applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client(), fetchImpl: healthy });
    expect(order).toEqual(["dry-run after 0 backup", "apply after 1 backup"]);
    expect(runMigrations.mock.calls[1][2]).toMatchObject({ mode: "apply", requireExistingLedger: true, appRole: "app_rw" });
    expect(log).toContain("create pre-migrate-0123456 from br-prod");
    expect(log).toContain("delete br-old");
    expect(r).toMatchObject({ applied: ["0001_a.sql"], backupBranch: "pre-migrate-0123456", warnings: [] });
  });

  it("keeps an existing backup of the same commit (a retry)", async () => {
    const same: NeonBranch = { id: "br-same", name: "pre-migrate-0123456", parentId: "br-prod", isDefault: false, isProtected: false };
    const { neon, log } = fakeNeon([prod, same]);
    runMigrations.mockImplementation(async (_c, _f, o: { mode: string }) => (o.mode === "apply" ? st("applied") : st("pending")));
    await applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client(), fetchImpl: healthy });
    expect(log.some((l) => l.startsWith("create"))).toBe(false);
    expect(log.some((l) => l.startsWith("delete"))).toBe(false);
  });

  it("stops before any backup or write on a checksum mismatch", async () => {
    const { neon, log } = fakeNeon([prod]);
    runMigrations.mockResolvedValueOnce(st("mismatch"));
    await expect(applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client() })).rejects.toThrow(/checksum/);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(log.some((l) => l.startsWith("create"))).toBe(false);
  });

  it("fails when the ledger does not show everything applied afterwards", async () => {
    const { neon } = fakeNeon([prod]);
    runMigrations.mockResolvedValue(st("pending"));
    await expect(applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client() })).rejects.toThrow(/registro non torna/);
  });

  it("reports an unhealthy instance as a warning, after the migration", async () => {
    const { neon } = fakeNeon([prod]);
    runMigrations.mockImplementation(async (_c, _f, o: { mode: string }) => (o.mode === "apply" ? st("applied") : st("pending")));
    const sick = (async () => new Response(JSON.stringify({ ok: false, db: false }), { status: 503 })) as never;
    const r = await applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client(), fetchImpl: sick });
    expect(r.warnings).toEqual(["health: l'istanza non risponde ok col database"]);
  });

  it("refuses a project without a default branch", async () => {
    const { neon } = fakeNeon([{ ...prod, isDefault: false }]);
    await expect(applyInstance(target, bundle, { apiKey: "k", neon, connect: async () => client() })).rejects.toThrow(/ramo di produzione/);
  });
});
