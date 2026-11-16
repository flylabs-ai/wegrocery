import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCK_TIMEOUT, isMigrationFile, prepareMigration } from "./db-migrate-lib.mjs";
import {
  ROLLBACK_REQUIRED_FROM,
  appRoleRevokeStatements,
  appRoleStatements,
  migrationLedgerRevokeStatement,
  roleUrl,
} from "./db-role-lib.mjs";

// Playbook 6.2: every file in drizzle/ runs in one transaction with a lock
// timeout, and from ROLLBACK_REQUIRED_FROM on each ships with its rollback.
describe("the migrations in drizzle/", () => {
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
  const migrations = files.filter(isMigrationFile);
  const number = (f: string) => Number(f.slice(0, 4));

  it("are numbered NNNN_name.sql, one per number", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    expect(new Set(migrations.map(number)).size).toBe(migrations.length);
  });

  it("are all accepted by the kit's runner: one transaction each, nothing it refuses", () => {
    const refused = migrations.flatMap((f) => {
      try {
        prepareMigration(f, readFileSync(`drizzle/${f}`, "utf8"));
        return [];
      } catch (error) {
        return [`${f}: ${(error as Error).message}`];
      }
    });
    expect(refused).toEqual([]);
  });

  it("wait at most 5 seconds for a lock", () => {
    expect(LOCK_TIMEOUT).toBe("5s");
  });

  it(`from ${ROLLBACK_REQUIRED_FROM} on, come with a _down.sql and an Apply/Rollback header`, () => {
    const recent = migrations.filter((f) => number(f) >= ROLLBACK_REQUIRED_FROM);
    expect(recent.length).toBeGreaterThan(0);
    for (const f of recent) {
      const down = f.replace(/\.sql$/, "_down.sql");
      expect(files, `${f} needs drizzle/${down}`).toContain(down);
      const header = readFileSync(`drizzle/${f}`, "utf8");
      expect(header, `${f} header`).toMatch(/^-- Apply:/m);
      expect(header, `${f} header`).toMatch(new RegExp(`^-- Rollback:.*${down}`, "m"));
    }
  });

  it("have no rollback file without its migration", () => {
    for (const f of files.filter((n) => n.endsWith("_down.sql"))) {
      expect(migrations).toContain(f.replace(/_down\.sql$/, ".sql"));
    }
  });
});

describe("appRoleStatements", () => {
  const all = (role = "app_rw", pw = "p".repeat(24)) => appRoleStatements(role, pw, "neondb").join("\n");

  it("grants data access only: no DDL, no ownership, no superuser", () => {
    const sql = all();
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public");
    expect(sql).toContain("NOSUPERUSER NOCREATEDB NOCREATEROLE");
    expect(sql).not.toMatch(/GRANT (ALL|CREATE)\b|OWNER TO|TRUNCATE|REFERENCES/i);
  });

  it("covers the tables created later and keeps the migration ledger read only", () => {
    const sql = all();
    expect(sql).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public._migrations");
  });

  it("refuses a role name that is not a plain identifier and a short password", () => {
    expect(() => appRoleStatements('x"; DROP TABLE members; --', "p".repeat(24), "db")).toThrow(/invalid role/);
    expect(() => appRoleStatements("app_rw", "short", "db")).toThrow(/24 characters/);
  });

  it("quotes a password with a single quote", () => {
    expect(all("app_rw", "a'b".padEnd(24, "x"))).toContain("'a''bxxxxxxxxxxxxxxxxxxxxx'");
  });
});

describe("appRoleRevokeStatements", () => {
  it("revokes everything and drops the role", () => {
    const sql = appRoleRevokeStatements("app_rw", "neondb");
    expect(sql.at(-1)).toBe('DROP ROLE IF EXISTS "app_rw"');
    expect(sql.join("\n")).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "app_rw"');
  });
});

describe("roleUrl", () => {
  it("swaps user and password, keeps host, database and options, encodes the password", () => {
    const out = roleUrl("postgresql://neondb_owner:old@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require", "app_rw", "a/b+c=d");
    const u = new URL(out);
    expect(u.username).toBe("app_rw");
    expect(decodeURIComponent(u.password)).toBe("a/b+c=d");
    expect(u.host).toBe("ep-x.eu-central-1.aws.neon.tech");
    expect(u.pathname).toBe("/neondb");
    expect(u.search).toBe("?sslmode=require");
  });
});

describe("migrationLedgerRevokeStatement", () => {
  it("takes write access to the ledger away, only when ledger and role exist", () => {
    const sql = migrationLedgerRevokeStatement("app_rw");
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public._migrations FROM "app_rw"');
    expect(sql).toContain("to_regclass('public._migrations') IS NOT NULL");
    expect(sql).toContain("rolname = 'app_rw'");
  });

  it("refuses a role name that is not a plain identifier", () => {
    expect(() => migrationLedgerRevokeStatement("x'; DROP TABLE members; --")).toThrow(/invalid role/);
  });
});
