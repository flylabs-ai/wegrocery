import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@neondatabase/serverless";
import { createNeonClient, main, runMigrations } from "./db-migrate.mjs";

const directories: string[] = [];
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), "flylabs-migration-unit-"));
  directories.push(dir);
  writeFileSync(join(dir, "001_example.sql"), "SELECT 1;");
  return dir;
};
// Construct synthetic connection input without ever using an app environment.
const connection = new URL("postgresql://localhost/example");
connection.username = "test_owner";
connection.password = "synthetic-private-value";
const env = { DATABASE_URL: connection.href };
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true })));

describe("command boundary", () => {
  it("refuses production before creating a client, including status", async () => {
    const createClient = vi.fn();
    const messages: string[] = [];
    expect(await main(["--status"], { env: { ...env, PRODUCTION_DB_HOST: "localhost" }, createClient, log: (text: string) => messages.push(text) })).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(messages.join(" ")).toContain("Production database refused");
    expect(messages.join(" ")).not.toContain(connection.password);
  });

  it("sanitizes connection errors and closes a failed client", async () => {
    const end = vi.fn();
    const messages: string[] = [];
    const createClient = async () => ({ connect: async () => { throw new Error(connection.href); }, end, query: vi.fn() });
    expect(await main([], { env, directory: directory(), createClient, log: (text: string) => messages.push(text) })).toBe(1);
    expect(end).toHaveBeenCalledOnce();
    expect(messages.join(" ")).toBe("Migration command failed");
  });

  it("reports checksum mismatches and returns exit 1 in status and dry-run", async () => {
    const query = async (sql: string) => ({ rows: sql.includes("to_regclass") ? [{ name: "_migrations" }] : sql.includes("information_schema") ? [{ exists: 1 }] : [{ name: "001_example.sql", checksum: "invalid-private-value" }] });
    for (const mode of ["--status", "--dry-run"]) {
      const messages: string[] = [];
      const client = { connect: async () => {}, end: async () => {}, query };
      expect(await main([mode], { env, directory: directory(), createClient: async () => client, log: (text: string) => messages.push(text) })).toBe(1);
      expect(messages[0]).toMatch(/^mismatch: 001_example.sql expected=[a-f0-9]{64} recorded=invalid$/);
      expect(messages.join(" ")).not.toContain("private-value");
    }
  });

  it("constructs the Neon Client without connecting or changing app transport", async () => {
    const client = await createNeonClient(connection.href);
    expect(client).toBeInstanceOf(Client);
    await client.end();
  });

  it("sanitizes inspection errors and refuses invalid options", async () => {
    await expect(runMigrations({ query: async () => { throw new Error(connection.href); } }, [])).rejects.toThrow("Migration inspection failed");
    const log = vi.fn();
    expect(await main(["--status", "--dry-run"], { env, log })).toBe(1);
    expect(log).toHaveBeenCalledWith("Choose only one migration mode");
  });
});
