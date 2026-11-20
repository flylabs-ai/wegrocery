import { describe, expect, it } from "vitest";
import type { NeonBranch } from "@/lib/providers/neon";
import {
  backupBranchName,
  blocker,
  eligibility,
  fullyApplied,
  migrationPlan,
  parseFleetKeys,
  productionBranch,
  staleBackups,
  summarize,
  type MigrationCandidate,
} from "./plan";

const KEY = "napi_" + "a".repeat(40);

const inst = (o: Partial<MigrationCandidate> = {}): MigrationCandidate => ({
  id: "ins_1",
  name: "Demo",
  status: "live",
  rolloutOrder: 10,
  createdAt: "2026-10-01T00:00:00Z",
  neonProjectId: "flat-river-1",
  ...o,
});

describe("parseFleetKeys", () => {
  it("reads project=key pairs separated by commas or new lines", () => {
    const k = parseFleetKeys(` flat-river-1=${KEY} ,\ncold-sound-2=${KEY}b`);
    expect([...k.keys()]).toEqual(["flat-river-1", "cold-sound-2"]);
    expect(k.get("cold-sound-2")).toBe(`${KEY}b`);
  });

  it("drops malformed entries", () => {
    expect(parseFleetKeys(`=x,nokey,Bad_Project=${KEY},ok-proj=short,ok-proj=${KEY} space`).size).toBe(0);
    expect(parseFleetKeys(null).size).toBe(0);
  });
});

describe("eligibility", () => {
  const keys = parseFleetKeys(`flat-river-1=${KEY}`);

  it("accepts a live instance with a project and its key", () => {
    expect(eligibility(inst(), keys)).toEqual({ ok: true });
  });

  it("refuses instances with real members (rollout order 1000+), even with a key", () => {
    const e = eligibility(inst({ rolloutOrder: 1000 }), keys);
    expect(e.ok).toBe(false);
  });

  it("refuses without a project, without a key, or when not live", () => {
    expect(eligibility(inst({ neonProjectId: null }), keys).ok).toBe(false);
    expect(eligibility(inst({ neonProjectId: "other-proj" }), keys).ok).toBe(false);
    expect(eligibility(inst({ status: "provisioning" }), keys).ok).toBe(false);
  });
});

describe("migrationPlan", () => {
  it("orders the eligible by rollout order and lists the rest with a reason, archived left out", () => {
    const keys = parseFleetKeys(`a-proj=${KEY},b-proj=${KEY}`);
    const p = migrationPlan(
      [
        inst({ id: "pm", name: "Porta", rolloutOrder: 1000, neonProjectId: "a-proj" }),
        inst({ id: "demo", name: "Demo", rolloutOrder: 10, neonProjectId: "a-proj" }),
        inst({ id: "eb", name: "Example", rolloutOrder: 5, neonProjectId: "b-proj" }),
        inst({ id: "old", name: "Old", status: "archived", neonProjectId: "b-proj" }),
      ],
      keys,
    );
    expect(p.eligible.map((i) => i.id)).toEqual(["eb", "demo"]);
    expect(p.manual.map((m) => m.instance.id)).toEqual(["pm"]);
  });
});

describe("branches", () => {
  const b = (o: Partial<NeonBranch>): NeonBranch => ({ id: "br-x", name: "x", parentId: null, isDefault: false, isProtected: false, ...o });

  it("names the backup after the short commit", () => {
    expect(backupBranchName("0123456789abcdef0123456789abcdef01234567")).toBe("pre-migrate-0123456");
  });

  it("finds the default branch", () => {
    expect(productionBranch([b({ id: "br-1" }), b({ id: "br-2", isDefault: true })])?.id).toBe("br-2");
    expect(productionBranch([b({})])).toBeNull();
  });

  it("removes only older backups it made, never the default or a protected one", () => {
    const stale = staleBackups(
      [
        b({ id: "keep", name: "pre-migrate-aaaaaaa" }),
        b({ id: "old", name: "pre-migrate-bbbbbbb" }),
        b({ id: "prot", name: "pre-migrate-ccccccc", isProtected: true }),
        b({ id: "main", name: "pre-migrate-ddddddd", isDefault: true }),
        b({ id: "other", name: "backup-2026-11-11" }),
      ],
      "keep",
    );
    expect(stale.map((x) => x.id)).toEqual(["old"]);
  });
});

describe("summaries", () => {
  const st = (name: string, state: "pending" | "applied" | "unverified" | "mismatch" | "missing-local") => ({
    name,
    state,
    checksum: null,
    recordedChecksum: null,
  });

  it("counts states and blocks on a mismatch or an unknown applied file", () => {
    const s = summarize([st("0001_a.sql", "applied"), st("0002_b.sql", "pending"), st("0003_c.sql", "unverified")]);
    expect(s).toEqual({ applied: 1, pending: ["0002_b.sql"], unverified: ["0003_c.sql"], mismatch: [], unknown: [] });
    expect(blocker(s)).toBeNull();
    expect(fullyApplied(s)).toBe(false);
    expect(blocker(summarize([st("0001_a.sql", "mismatch")]))).toMatch(/checksum/);
    expect(blocker(summarize([st("0099_z.sql", "missing-local")]))).toMatch(/non conosce/);
    expect(fullyApplied(summarize([st("0001_a.sql", "applied")]))).toBe(true);
  });
});
