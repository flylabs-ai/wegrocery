// WeGrocery's own database helpers next to the FlyLabs Kit migration runner
// (scripts/db-migrate.mjs and scripts/db-migrate-lib.mjs, module migrazioni):
// the restricted app role (Playbook 1.4) and the rollback rule for drizzle/.
// Pure, so they can be tested without a database.

/**
 * The app's address for a role: the owner's address with the role's name and
 * password (URL-encoded by the URL class). Used by create-app-role.mjs to save
 * the address without ever printing it.
 */
export function roleUrl(ownerUrl, role, password) {
  const u = new URL(ownerUrl);
  u.username = role;
  u.password = password;
  return u.toString();
}

/** First migration number that must ship with a `_down.sql` and an Apply/Rollback header. */
export const ROLLBACK_REQUIRED_FROM = 36;

/**
 * Playbook 1.4: the statements that give the app a role with data access only
 * (SELECT, INSERT, UPDATE, DELETE; no DDL, no ownership, so it cannot drop the
 * ledger trigger or a table). Idempotent: running it again resets the password
 * and re-grants the tables created since. `database` is the current database.
 */
export function appRoleStatements(role, password, database) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`invalid role name: ${role}`);
  if (password.length < 24) throw new Error("the password needs at least 24 characters");
  const ident = (v) => `"${v.replaceAll('"', '""')}"`;
  const literal = (v) => `'${v.replaceAll("'", "''")}'`;
  return [
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${literal(role)}) THEN
        CREATE ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE;
      ELSE
        ALTER ROLE ${ident(role)} PASSWORD ${literal(password)};
      END IF;
    END $$`,
    `GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(role)}`,
    `GRANT USAGE ON SCHEMA public TO ${ident(role)}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(role)}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(role)}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ident(role)}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${ident(role)}`,
    migrationLedgerRevokeStatement(role),
  ];
}

/**
 * The migration ledger is read by the configuration status, never written by
 * the app. A role created before the ledger exists (a new installation) gets
 * write access to it through the default privileges; the kit's db-migrate.mjs
 * revokes it again after creating the ledger. A no-op when the ledger or the
 * role does not exist.
 */
export function migrationLedgerRevokeStatement(role) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`invalid role name: ${role}`);
  const literal = `'${role}'`;
  return `DO $$ BEGIN
      IF to_regclass('public._migrations') IS NOT NULL AND EXISTS (SELECT FROM pg_roles WHERE rolname = ${literal}) THEN
        REVOKE INSERT, UPDATE, DELETE ON public._migrations FROM "${role}";
      END IF;
    END $$`;
}

/**
 * The way back: takes every privilege away and drops the role (on Neon the
 * owner cannot DROP OWNED BY, so privileges are revoked one by one).
 */
export function appRoleRevokeStatements(role, database) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`invalid role name: ${role}`);
  const ident = (v) => `"${v.replaceAll('"', '""')}"`;
  const r = ident(role);
  return [
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${r}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${r}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${r}`,
    `REVOKE ALL ON SCHEMA public FROM ${r}`,
    `REVOKE ALL ON DATABASE ${ident(database)} FROM ${r}`,
    `DROP ROLE IF EXISTS ${r}`,
  ];
}
