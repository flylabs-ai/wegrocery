import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ADVISORY_LOCK, MigrationError, appRoleFromEnv, isMigrationFile,
  prepareMigration, readMigrations, refusesProduction, sortMigrations,
} from "./db-migrate-lib.mjs";

function safeFailure(context, error) {
  const code = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? ` (SQLSTATE ${error.code})` : "";
  return new MigrationError(`${context}${code}`);
}

async function ledger(client) {
  const exists = (await client.query("SELECT to_regclass('public._migrations') AS name")).rows[0].name !== null;
  if (!exists) return { exists, rows: [] };
  const hasChecksum = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='_migrations' AND column_name='checksum'")).rows.length > 0;
  const rows = (await client.query(`SELECT name, ${hasChecksum ? "checksum" : "NULL::text AS checksum"} FROM public._migrations ORDER BY name`)).rows;
  if (rows.some((row) => !isMigrationFile(row.name))) throw new MigrationError("Invalid migration ledger filename");
  return { exists, rows };
}

function statusFor(files, snapshot) {
  const known = new Map(files.map((file) => [file.name, file]));
  const applied = new Map(snapshot.rows.map((row) => [row.name, row]));
  return [
    ...files.map((file) => {
      const row = applied.get(file.name);
      const state = !row ? "pending" : row.checksum == null ? "unverified" : row.checksum === file.checksum ? "applied" : "mismatch";
      return { name: file.name, state, checksum: file.checksum, recordedChecksum: row?.checksum == null ? null : /^[a-f0-9]{64}$/.test(row.checksum) ? row.checksum : "invalid" };
    }),
    ...snapshot.rows.filter((row) => !known.has(row.name)).map((row) => ({ name: row.name, state: "missing-local", checksum: null, recordedChecksum: null })),
  ];
}

function assertChecksums(status) {
  const mismatch = status.find((file) => file.state === "mismatch");
  if (mismatch) throw new MigrationError(`Checksum mismatch: ${mismatch.name}`);
}

async function startLocked(client, begin) {
  await client.query(begin);
  // Each SELECT after a waited lock must see the other runner's commit.
  await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL standard_conforming_strings = on");
  await client.query("SELECT pg_advisory_xact_lock($1::integer, $2::integer)", ADVISORY_LOCK);
}

async function transaction(client, begin, commit, context, work) {
  try {
    await startLocked(client, begin);
    const result = await work();
    await client.query(commit);
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch { throw new MigrationError(`${context}; rollback unconfirmed, inspect --status before retrying`); }
    if (error instanceof MigrationError) throw error;
    throw safeFailure(context, error);
  }
}

/** Use a dedicated connected client with no active transaction. Caller closes it. */
export async function runMigrations(client, migrations, options = {}) {
  const mode = options.mode ?? "apply";
  if (!["apply", "status", "dry-run"].includes(mode)) throw new MigrationError("Invalid migration mode");
  if (options.appRole && !/^[a-z_][a-z0-9_]{0,62}$/.test(options.appRole)) throw new MigrationError("Invalid application role");
  try {
    const files = sortMigrations(migrations);
    const initial = await ledger(client);
    const status = statusFor(files, initial);
    const result = { status, applied: [], skipped: [], backfilled: [] };
    if (mode === "status") return result;
    if (mode === "apply") assertChecksums(status);
    // Read-only planning still validates pending SQL; checksum mismatches remain visible.
    const pending = status.filter((file) => file.state === "pending");
    const plans = new Map(pending.map(({ name }) => {
      const file = files.find((candidate) => candidate.name === name);
      return [name, prepareMigration(name, file.sql)];
    }));
    if (mode === "dry-run") return result;
    if (options.requireExistingLedger && !initial.exists) throw new MigrationError("Migration ledger is missing; use the app's bootstrap procedure");

    await transaction(client, "BEGIN", "COMMIT", "Migration ledger update failed", async () => {
      const current = await ledger(client);
      assertChecksums(statusFor(files, current));
      if (options.requireExistingLedger && !current.exists) throw new MigrationError("Migration ledger is missing");
      await client.query("CREATE TABLE IF NOT EXISTS public._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      await client.query("ALTER TABLE public._migrations ADD COLUMN IF NOT EXISTS checksum text");
      if (options.appRole && (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [options.appRole])).rows.length) {
        await client.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public._migrations FROM "${options.appRole}"`);
      }
      for (const row of current.rows) {
        const file = files.find((candidate) => candidate.name === row.name);
        if (file && row.checksum == null) {
          await client.query("UPDATE public._migrations SET checksum=$2 WHERE name=$1 AND checksum IS NULL", [file.name, file.checksum]);
          result.backfilled.push(file.name);
        }
      }
    });

    for (const file of files) {
      const plan = plans.get(file.name);
      if (!plan) { result.skipped.push(file.name); continue; }
      const applied = await transaction(client, plan.begin, plan.commit, `Migration failed: ${file.name}`, async () => {
        const current = await ledger(client);
        assertChecksums(statusFor(files, current));
        const existing = current.rows.find((row) => row.name === file.name);
        if (existing) {
          if (existing.checksum == null) {
            await client.query("UPDATE public._migrations SET checksum=$2 WHERE name=$1 AND checksum IS NULL", [file.name, file.checksum]);
            result.backfilled.push(file.name);
          }
          return false;
        }
        for (const statement of plan.statements) await client.query(statement);
        // File-owned migrations may already insert their own name. Preserve applied_at.
        await client.query("INSERT INTO public._migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET checksum=EXCLUDED.checksum", [file.name, file.checksum]);
        return true;
      });
      result[applied ? "applied" : "skipped"].push(file.name);
    }
    result.status = statusFor(files, await ledger(client));
    return result;
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw safeFailure("Migration inspection failed", error);
  }
}

/** Neon WebSocket transport is restricted to this migration process. */
export async function createNeonClient(connectionString) {
  const { Client, neonConfig } = await import("@neondatabase/serverless");
  if (!neonConfig.webSocketConstructor && globalThis.WebSocket) neonConfig.webSocketConstructor = globalThis.WebSocket;
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  // Idle socket errors must not print the driver's unsanitized error object.
  client.on("error", () => {});
  return client;
}

export async function main(argv = process.argv.slice(2), config = {}) {
  const env = config.env ?? process.env;
  const log = config.log ?? console.log;
  let client;
  let code = 0;
  try {
    const args = [...argv];
    let directory = config.directory ?? resolve("migrations");
    const modes = [];
    let requireExistingLedger = config.requireExistingLedger ?? false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--dir" && args[i + 1] && !args[i + 1].startsWith("--")) directory = resolve(args[++i]);
      else if (args[i] === "--status") modes.push("status");
      else if (args[i] === "--dry-run") modes.push("dry-run");
      else if (args[i] === "--require-ledger") requireExistingLedger = true;
      else if (args[i] !== "--allow-prod") throw new MigrationError("Invalid arguments; use --dir, --status, --dry-run, --require-ledger or --allow-prod");
    }
    if (modes.length > 1) throw new MigrationError("Choose only one migration mode");
    const connection = env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
    if (!connection) throw new MigrationError("DATABASE_MIGRATION_URL or DATABASE_URL is required");
    if (refusesProduction(connection, env, argv)) throw new MigrationError("Production database refused; use --allow-prod explicitly");
    const appRole = appRoleFromEnv(env);
    const files = readMigrations(directory);
    client = await (config.createClient ?? createNeonClient)(connection);
    await client.connect();
    const result = await runMigrations(client, files, { mode: modes[0] ?? "apply", requireExistingLedger, appRole });
    for (const file of result.status) log(`${file.state}: ${file.name}${file.state === "mismatch" ? ` expected=${file.checksum} recorded=${file.recordedChecksum}` : ""}`);
    log(`Applied: ${result.applied.length}; skipped: ${result.skipped.length}; checksums added: ${result.backfilled.length}`);
    if (result.status.some((file) => file.state === "mismatch")) code = 1;
  } catch (error) {
    log(error instanceof MigrationError ? error.message : safeFailure("Migration command failed", error).message);
    code = 1;
  } finally {
    if (client) {
      try { await client.end(); }
      catch { log("Migration connection could not close cleanly; inspect --status before retrying"); code = 1; }
    }
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
