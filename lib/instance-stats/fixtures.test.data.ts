import type { InstanceStats } from "./stats";

// Field order and envelopes copied from the app response builders, values synthetic.
export const WG_CONFIG_IDS = ["database", "email", "stripe", "signIn", "firstAdmin", "brand", "authSecret", "baseUrl", "membership", "sentry", "dbRole", "fleet", "autoOpen"] as const;
export const STELLAR_CONFIG_IDS = ["database", "auth", "email", "cron", "engine", "watchdog", "signup", "google", "stripe", "push", "console", "sentry"] as const;
export const WG_STATS = {
  app: "wegrocery", version: "1.2.0", generatedAt: "2026-11-16T10:00:00.000Z", installedAt: "2026-01-01T00:00:00.000Z", databaseBytes: 123456,
  counts: { activeMembers: 4, admins: 1, members: 5, cycles: 6, openCycles: 1, ordersLast30Days: 7 },
  config: WG_CONFIG_IDS.map((id) => ({ id, status: "ok" as const })), pendingMigrations: [], lastClosedAt: "2026-11-01T10:00:00.000Z", paymentMode: "wallet", setupCompleted: true,
} satisfies InstanceStats & { lastClosedAt: string | null; paymentMode: string; setupCompleted: boolean };
export const STELLAR_STATS: InstanceStats = {
  app: "stellar", version: "0.1.0", generatedAt: "2026-11-16T10:00:00.000Z", installedAt: null, databaseBytes: 654321,
  counts: { customers: 2, paying: 1, inTrial: 1, members: 3, properties: 4, sources: 5, draftsLast30Days: 6, publishedLast30Days: 2 },
  config: STELLAR_CONFIG_IDS.map((id) => ({ id, status: "ok" })), pendingMigrations: ["001_example.sql"],
};
export const LEGACY_STATS = {
  version: "1.2.0", generatedAt: "2026-11-16T10:00:00.000Z", installedAt: "2026-01-01T00:00:00.000Z",
  members: { active: 4, admins: 1, total: 5 }, cycles: { total: 6, open: 1, lastClosedAt: "2026-11-01T10:00:00.000Z" },
  ordersLast30Days: 7, databaseBytes: 123456, paymentMode: "wallet", config: WG_CONFIG_IDS.map((id) => ({ id, status: "ok" })), pendingMigrations: [], setupCompleted: true,
};
export const WG_STATS_JSON = '{"app":"wegrocery","version":"1.2.0","generatedAt":"2026-11-16T10:00:00.000Z","installedAt":"2026-01-01T00:00:00.000Z","databaseBytes":123456,"counts":{"activeMembers":4,"admins":1,"members":5,"cycles":6,"openCycles":1,"ordersLast30Days":7},"config":[{"id":"database","status":"ok"},{"id":"email","status":"ok"},{"id":"stripe","status":"ok"},{"id":"signIn","status":"ok"},{"id":"firstAdmin","status":"ok"},{"id":"brand","status":"ok"},{"id":"authSecret","status":"ok"},{"id":"baseUrl","status":"ok"},{"id":"membership","status":"ok"},{"id":"sentry","status":"ok"},{"id":"dbRole","status":"ok"},{"id":"fleet","status":"ok"},{"id":"autoOpen","status":"ok"}],"pendingMigrations":[],"lastClosedAt":"2026-11-01T10:00:00.000Z","paymentMode":"wallet","setupCompleted":true}';
export const STELLAR_STATS_JSON = '{"app":"stellar","version":"0.1.0","generatedAt":"2026-11-16T10:00:00.000Z","installedAt":null,"databaseBytes":654321,"counts":{"customers":2,"paying":1,"inTrial":1,"members":3,"properties":4,"sources":5,"draftsLast30Days":6,"publishedLast30Days":2},"config":[{"id":"database","status":"ok"},{"id":"auth","status":"ok"},{"id":"email","status":"ok"},{"id":"cron","status":"ok"},{"id":"engine","status":"ok"},{"id":"watchdog","status":"ok"},{"id":"signup","status":"ok"},{"id":"google","status":"ok"},{"id":"stripe","status":"ok"},{"id":"push","status":"ok"},{"id":"console","status":"ok"},{"id":"sentry","status":"ok"}],"pendingMigrations":["001_example.sql"]}';
