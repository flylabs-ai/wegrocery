import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const LOCK_TIMEOUT = "5s";
// Two fixed int32 keys, shared by every version of this runner in a database.
export const ADVISORY_LOCK = [1179402562, 1296648018];

export class MigrationError extends Error {
  constructor(message) { super(message); this.name = "MigrationError"; }
}

export function isMigrationFile(name) {
  return /^\d+_[a-z0-9_]+\.sql$/.test(name) && !name.endsWith("_down.sql");
}

/** Hash original file bytes, not the kit's line-ending-normalized fingerprint. */
export function checksum(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

/** A lexical splitter, not a SQL grammar parser. Quoted bodies stay opaque. */
function scanStatements(raw) {
  const result = [];
  let text = "", code = "", i = 0;
  const flush = () => {
    if (text.trim()) result.push({ text: text.trim(), code: code.trim() });
    text = ""; code = "";
  };
  while (i < raw.length) {
    if (raw.startsWith("--", i)) {
      const end = raw.indexOf("\n", i);
      if (raw.startsWith("--> statement-breakpoint", i)) flush();
      text += " "; code += " ";
      i = end === -1 ? raw.length : end + 1;
    } else if (raw.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < raw.length && depth) {
        if (raw.startsWith("/*", i)) { depth++; i += 2; }
        else if (raw.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new MigrationError("Unterminated SQL comment");
      text += " "; code += " ";
    } else if (raw[i] === "'" || raw[i] === '"') {
      const quote = raw[i], start = i;
      const escaped = quote === "'" && /[eE]/.test(raw[i - 1] ?? "") && !/[\w$]/.test(raw[i - 2] ?? "");
      let closed = false;
      i++;
      while (i < raw.length) {
        if (escaped && raw[i] === "\\") i += 2;
        else if (raw[i] === quote && raw[i + 1] === quote) i += 2;
        else if (raw[i] === quote) { i++; closed = true; break; }
        else i++;
      }
      if (!closed) throw new MigrationError("Unterminated SQL quote");
      text += raw.slice(start, i); code += " ";
    } else if (raw[i] === "$" && !/[\w$]/.test(raw[i - 1] ?? "") && /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.test(raw.slice(i))) {
      const tag = raw.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)[0];
      const end = raw.indexOf(tag, i + tag.length);
      if (end === -1) throw new MigrationError("Unterminated SQL dollar quote");
      text += raw.slice(i, end + tag.length); code += " ";
      i = end + tag.length;
    } else if (raw[i] === ";") {
      flush(); i++;
    } else {
      text += raw[i]; code += raw[i]; i++;
    }
  }
  flush();
  return result;
}

export function splitStatements(raw) {
  return scanStatements(raw).map(({ text }) => text);
}

const transactionControl = /^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\b/i;
const begin = /^(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION)$/i;
const commit = /^(?:COMMIT|END)(?:\s+(?:WORK|TRANSACTION))?$/i;

export function prepareMigration(name, raw) {
  if (!isMigrationFile(name)) throw new MigrationError("Invalid migration filename");
  const pieces = scanStatements(raw);
  const ownsTransaction = begin.test(pieces[0]?.code ?? "");
  let body = pieces;
  if (ownsTransaction) {
    if (pieces.length < 2 || !commit.test(pieces.at(-1).code)) throw new MigrationError(`Invalid file transaction: ${name}`);
    body = pieces.slice(1, -1);
  }
  if (body.some(({ code }) => transactionControl.test(code) || /^SET\s+(?:LOCAL\s+)?TRANSACTION\b/i.test(code))) {
    throw new MigrationError(`Unexpected transaction control: ${name}`);
  }
  const timeouts = body.filter(({ text }) => /^(?:SET\s+(?:(?:LOCAL|SESSION)\s+)?(?:lock_timeout\b|"lock_timeout")|RESET\s+(?:lock_timeout\b|"lock_timeout"|ALL\b))/i.test(text));
  const validTimeout = (piece) => /^SET\s+LOCAL\s+lock_timeout\s*(?:=|TO)\s*'5s'$/i.test(piece.text);
  if ((ownsTransaction && !timeouts.length) || timeouts.some((piece) => !validTimeout(piece))) {
    throw new MigrationError(`Expected SET LOCAL lock_timeout = '5s': ${name}`);
  }
  const refused = body.some(({ code }) => /\bCONCURRENTLY\b/i.test(code)
    || /^(?:VACUUM|ALTER\s+SYSTEM)\b/i.test(code)
    || /^(?:CREATE|DROP)\s+(?:DATABASE|TABLESPACE|SUBSCRIPTION)\b/i.test(code)
    || /^REINDEX\s+(?:\([^)]*\)\s*)?(?:SYSTEM|DATABASE)\b/i.test(code)
    || /^SET\s+(?:(?:LOCAL|SESSION)\s+)?standard_conforming_strings\b/i.test(code)
    || /^DISCARD\s+ALL\b/i.test(code));
  const changesStringRules = body.some(({ text }) => /^(?:SET\s+(?:(?:LOCAL|SESSION)\s+)?|RESET\s+)(?:standard_conforming_strings\b|"standard_conforming_strings")/i.test(text));
  if (refused || changesStringRules) throw new MigrationError(`Migration cannot run in a transaction: ${name}`);
  return {
    name, checksum: checksum(raw), transaction: ownsTransaction ? "file" : "runner",
    begin: ownsTransaction ? pieces[0].text : "BEGIN",
    commit: ownsTransaction ? pieces.at(-1).text : "COMMIT",
    statements: body.map(({ text }) => text),
  };
}

export function readMigrations(dir) {
  try {
    return readdirSync(dir).filter(isMigrationFile).map((name) => {
      const raw = readFileSync(join(dir, name));
      const sql = raw.toString("utf8");
      // Reject invalid UTF-8 rather than hashing a replacement-character version.
      if (!Buffer.from(sql, "utf8").equals(raw)) throw new Error();
      return { name, sql };
    });
  } catch {
    throw new MigrationError("Cannot read migration directory");
  }
}

export function sortMigrations(migrations) {
  const seen = new Set();
  const prepared = migrations.map(({ name, sql }) => {
    if (!isMigrationFile(name) || typeof sql !== "string") throw new MigrationError("Invalid migration input");
    const number = BigInt(name.split("_")[0]);
    if (seen.has(number)) throw new MigrationError(`Duplicate migration number: ${number}`);
    seen.add(number);
    return { name, sql, checksum: checksum(sql), number };
  });
  return prepared.sort((a, b) => a.number < b.number ? -1 : a.number > b.number ? 1 : 0);
}

function connectionUrl(raw) {
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) throw new Error();
    // Driver routing overrides would make a hostname-only production guard unsafe.
    if ([...url.searchParams.keys()].some((key) => ["host", "hostaddr", "port", "user", "password", "dbname", "database", "service"].includes(key.toLowerCase()))) throw new Error();
    return url;
  } catch { throw new MigrationError("Invalid database connection"); }
}

export function refusesProduction(raw, env, argv) {
  const url = connectionUrl(raw);
  const production = env.PRODUCTION_DB_HOST?.trim();
  if (!production) return false;
  if (production.includes("://") || /[\s/@?#]/.test(production)) throw new MigrationError("Invalid PRODUCTION_DB_HOST");
  const configured = connectionUrl(`postgresql://${production}/unused`);
  const canonical = (host) => host.toLowerCase().replace(/\.$/, "").replace(/-pooler(?=\..*\.neon\.tech$)/, "");
  return canonical(url.hostname) === canonical(configured.hostname) && !argv.includes("--allow-prod");
}

export function appRoleFromEnv(env) {
  if (!env.DATABASE_MIGRATION_URL || !env.DATABASE_URL) return null;
  try {
    const app = decodeURIComponent(connectionUrl(env.DATABASE_URL).username);
    const owner = decodeURIComponent(connectionUrl(env.DATABASE_MIGRATION_URL).username);
    return app && app !== owner && /^[a-z_][a-z0-9_]{0,62}$/.test(app) ? app : null;
  } catch { throw new MigrationError("Invalid database connection role"); }
}
