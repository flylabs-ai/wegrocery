export interface MigrationSource { name: string; sql: string }
export interface MigrationPlan {
  name: string;
  checksum: string;
  transaction: "file" | "runner";
  begin: string;
  commit: string;
  statements: string[];
}
export const LOCK_TIMEOUT: "5s";
export const ADVISORY_LOCK: number[];
export class MigrationError extends Error { constructor(message: string) }
export function isMigrationFile(name: string): boolean;
export function checksum(raw: string | Uint8Array): string;
export function splitStatements(raw: string): string[];
export function prepareMigration(name: string, raw: string): MigrationPlan;
export function readMigrations(directory: string): MigrationSource[];
export function sortMigrations(migrations: MigrationSource[]): (MigrationSource & { checksum: string; number: bigint })[];
export function refusesProduction(connection: string, env: Record<string, string | undefined>, argv: string[]): boolean;
export function appRoleFromEnv(env: Record<string, string | undefined>): string | null;
