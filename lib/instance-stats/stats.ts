// What /api/instance-stats answers the FlyLabs Console (Playbook 7.10,
// flylabs-kit registry/console): the same envelope in every app, the app's
// own numbers in counts. Counts and states only: no name, email, customer
// content, amount or balance, no variable value.
export type ConfigItemStatus = "ok" | "missing" | "warning" | "off";

export type InstanceStats = {
  // The app's id in the Console: "stellar", "wegrocery", ...
  app: string;
  // The same release as /api/health.
  version: string;
  generatedAt: string;
  // When the installation started serving (first migration or first customer).
  installedAt: string | null;
  databaseBytes: number | null;
  // The app's counts, by name, in camelCase: the Console shows any name it
  // does not know as it is.
  counts: Record<string, number>;
  // The configuration status of the staff panel and `npm run doctor`
  // (Playbook 7.5): ids and states, never values.
  config: { id: string; status: ConfigItemStatus }[];
  // The migrations this database lacks (Playbook 6.3).
  pendingMigrations: string[];
};

const EMAIL_LIKE = /[^\s<>"'@]+@[^\s<>"'@]+\.[^\s<>"'@.]+/u;
const STATUSES = new Set(["ok", "missing", "warning", "off"]);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function safeJson(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  if (depth > 64) throw new Error();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { if (EMAIL_LIKE.test(value)) throw new Error(); return; }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!Array.isArray(value) && !record(value)) throw new Error();
  if (ancestors.has(value) || Object.getOwnPropertySymbols(value).length) throw new Error();
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (EMAIL_LIKE.test(key) || descriptor.get || descriptor.set) throw new Error();
    safeJson(descriptor.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

/** Fail before serializing private or malformed data. Never echo the rejected value. */
export function assertSafeStats(stats: unknown): asserts stats is InstanceStats {
  try {
    safeJson(stats);
    if (!record(stats) || !["app", "version", "generatedAt", "installedAt", "databaseBytes", "counts", "config", "pendingMigrations"].every((key) => Object.hasOwn(stats, key))) throw new Error();
    if (typeof stats.app !== "string" || typeof stats.version !== "string" || typeof stats.generatedAt !== "string") throw new Error();
    if (!(stats.installedAt === null || typeof stats.installedAt === "string") || !(stats.databaseBytes === null || integer(stats.databaseBytes))) throw new Error();
    if (!record(stats.counts) || Object.entries(stats.counts).some(([key, count]) => !/^[a-z][a-zA-Z0-9]*$/.test(key) || !integer(count))) throw new Error();
    if (!Array.isArray(stats.config) || [...stats.config].some((item) => !record(item) || typeof item.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(item.id) || typeof item.status !== "string" || !STATUSES.has(item.status))) throw new Error();
    if (!Array.isArray(stats.pendingMigrations) || ![...stats.pendingMigrations].every((item) => typeof item === "string")) throw new Error();
  } catch { throw new Error("Unsafe instance stats"); }
}

export function statsResponse<Stats extends InstanceStats>(stats: Stats): Response {
  assertSafeStats(stats);
  return Response.json(stats, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export function notFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
