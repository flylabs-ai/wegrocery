import { describe, expect, it } from "vitest";
import {
  checksum, isMigrationFile, prepareMigration, refusesProduction, splitStatements,
} from "./db-migrate-lib.mjs";

describe("SQL splitting", () => {
  it("splits statements while preserving quoted semicolons and removing comments", () => {
    expect(splitStatements("-- SELECT 0;\nSELECT ';', 'it''s fine'; /* nested /* ; */ comment */ SELECT 2; -- tail")).toEqual([
      "SELECT ';', 'it''s fine'", "SELECT 2",
    ]);
  });
  it("keeps dollar-quoted function bodies and quoted identifiers together", () => {
    const sql = 'DO $body$ BEGIN PERFORM \'a;b\'; END $body$; SELECT "a;b";';
    expect(splitStatements(sql)).toEqual(["DO $body$ BEGIN PERFORM 'a;b'; END $body$", 'SELECT "a;b"']);
  });
  it("handles escape strings and Drizzle breakpoints outside strings", () => {
    expect(splitStatements("SELECT E'one\\';two';--> statement-breakpoint\nSELECT 2;")).toEqual(["SELECT E'one\\';two'", "SELECT 2"]);
    expect(splitStatements("SELECT 1\n--> statement-breakpoint\nSELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
  });
  it("rejects unfinished quotes/comments without printing their contents", () => {
    for (const sql of ["SELECT 'private-value", "DO $x$ private-value", "/* private-value", 'SELECT "private-value']) {
      expect(() => splitStatements(sql)).toThrow(/Unterminated SQL/);
      try { splitStatements(sql); } catch (error) { expect(String(error)).not.toContain("private-value"); }
    }
  });
});

describe("migration plans", () => {
  it("keeps file transaction boundaries and uses runner boundaries otherwise", () => {
    const file = prepareMigration("001_file.sql", "BEGIN; SET LOCAL lock_timeout = '5s'; SELECT 1; COMMIT;");
    expect(file.transaction).toBe("file");
    expect(file.begin).toBe("BEGIN");
    expect(file.commit).toBe("COMMIT");
    expect(file.statements).toEqual(["SET LOCAL lock_timeout = '5s'", "SELECT 1"]);
    expect(prepareMigration("0001_runner.sql", "SELECT 1;").transaction).toBe("runner");
  });
  it("rejects partial/nested transaction control before running a file", () => {
    for (const sql of ["BEGIN; SELECT 1;", "SELECT 1; COMMIT;", "BEGIN; BEGIN; COMMIT; COMMIT;", "ROLLBACK;", "BEGIN; SET LOCAL lock_timeout='5s'; COMMIT AND CHAIN;"]) {
      expect(() => prepareMigration("001_bad.sql", sql)).toThrow(/transaction/i);
    }
  });
  it("requires the file's own lock timeout to be 5 seconds", () => {
    expect(() => prepareMigration("001_bad.sql", "BEGIN; SELECT 1; COMMIT;")).toThrow(/lock_timeout/);
    expect(() => prepareMigration("001_bad.sql", "BEGIN; SET LOCAL lock_timeout='10s'; COMMIT;")).toThrow(/lock_timeout/);
    for (const sql of ["SET SESSION lock_timeout='0'", 'SET LOCAL "lock_timeout"=\'0\'', "RESET lock_timeout", "RESET ALL"]) {
      expect(() => prepareMigration("001_bad.sql", sql)).toThrow(/lock_timeout/);
    }
  });
  it("rejects non-transactional commands without confusing literals or comments", () => {
    for (const sql of ["VACUUM x", "CREATE INDEX CONCURRENTLY x ON y(id)", "ALTER SYSTEM SET work_mem='1MB'", "CREATE DATABASE x", "REINDEX DATABASE x"]) {
      expect(() => prepareMigration("001_bad.sql", sql)).toThrow(/cannot run in a transaction/);
    }
    expect(prepareMigration("001_ok.sql", "SELECT 'VACUUM CONCURRENTLY'; /* VACUUM */ SELECT 2;").statements).toHaveLength(2);
  });
  it("excludes rollbacks and hashes the original bytes, including line endings", () => {
    expect(isMigrationFile("001_ok.sql")).toBe(true);
    expect(isMigrationFile("0001_ok.sql")).toBe(true);
    expect(isMigrationFile("001_ok_down.sql")).toBe(false);
    expect(isMigrationFile("README.md")).toBe(false);
    expect(checksum("hello\n")).toBe("5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03");
    expect(checksum("hello\r\n")).not.toBe(checksum("hello\n"));
  });
});

describe("production guard", () => {
  const direct = "postgresql://test:synthetic@ep-test.region.neon.tech/example";
  it("requires --allow-prod for direct and pooled forms of the configured host", () => {
    const env = { PRODUCTION_DB_HOST: "ep-test.region.neon.tech" };
    expect(refusesProduction(direct, env, [])).toBe(true);
    expect(refusesProduction(direct.replace("ep-test.", "ep-test-pooler."), env, [])).toBe(true);
    expect(refusesProduction(direct, env, ["--status"])).toBe(true);
    expect(refusesProduction(direct, env, ["--allow-prod"])).toBe(false);
    expect(refusesProduction(direct, {}, [])).toBe(false);
  });
  it("rejects invalid connection syntax without echoing it", () => {
    expect(() => refusesProduction("private-value", {}, [])).toThrow("Invalid database connection");
    expect(() => refusesProduction(`${direct}?host=other-host`, {}, [])).toThrow("Invalid database connection");
  });
});
