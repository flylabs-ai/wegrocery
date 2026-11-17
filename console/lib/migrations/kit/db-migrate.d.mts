import type { Client } from "@neondatabase/serverless";
import type { MigrationSource } from "./db-migrate-lib.mjs";

export interface QueryClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface ConnectedClient extends QueryClient {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
}
export interface MigrationOptions {
  mode?: "apply" | "status" | "dry-run";
  requireExistingLedger?: boolean;
  appRole?: string | null;
}
export interface MigrationStatus {
  name: string;
  state: "pending" | "applied" | "unverified" | "mismatch" | "missing-local";
  checksum: string | null;
  recordedChecksum: string | null;
}
export interface MigrationResult {
  status: MigrationStatus[];
  applied: string[];
  skipped: string[];
  backfilled: string[];
}
export function runMigrations(client: QueryClient, migrations: MigrationSource[], options?: MigrationOptions): Promise<MigrationResult>;
export function createNeonClient(connectionString: string): Promise<Client>;
export function main(argv?: string[], config?: {
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  directory?: string;
  requireExistingLedger?: boolean;
  createClient?: (connection: string) => Promise<ConnectedClient>;
}): Promise<number>;
