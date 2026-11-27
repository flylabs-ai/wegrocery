import type { PushUsageEvent } from "@/lib/usage/events";
import type { WeGroceryInstanceStats } from "./collect";
import type { InstanceStats } from "./stats";

// The FlyLabs Kit envelope (module `console`, Playbook 7.10) for WeGrocery's
// numbers: the shared fields as they are, the counts by name in camelCase,
// plus three fields of WeGrocery's own that are not counts (the kit lets an
// app add fields; the Console reads the ones it knows). Pure.
export type WeGroceryFlyLabsStats = InstanceStats & {
  // When the last cycle closed, the payment mode and whether the first-run
  // setup is done: states, never amounts.
  lastClosedAt: string | null;
  paymentMode: string;
  setupCompleted: boolean;
  push?: WeGroceryInstanceStats["push"];
};

export const APP_ID = "wegrocery";

// The Console renders fields it recognizes as counts, including new names.
const pushCountNames: Record<PushUsageEvent, string> = {
  pwa_launch_standalone: "pwaLaunchStandaloneToday",
  pwa_launch_browser: "pwaLaunchBrowserToday",
  push_device_on: "pushDeviceOnToday",
  push_device_off: "pushDeviceOffToday",
  push_accepted: "pushAcceptedToday",
  push_expired: "pushExpiredToday",
  push_failed: "pushFailedToday",
  push_skipped: "pushSkippedToday",
  push_simulated: "pushSimulatedToday",
  push_opened: "pushOpenedToday",
};

export function toFlyLabsStats(s: WeGroceryInstanceStats): WeGroceryFlyLabsStats {
  return {
    app: APP_ID,
    version: s.version,
    generatedAt: s.generatedAt,
    installedAt: s.installedAt,
    databaseBytes: s.databaseBytes,
    counts: {
      activeMembers: s.members.active,
      admins: s.members.admins,
      members: s.members.total,
      cycles: s.cycles.total,
      openCycles: s.cycles.open,
      ordersLast30Days: s.ordersLast30Days,
      ...Object.fromEntries(Object.entries(pushCountNames).flatMap(([event, name]) => {
        const count = s.pushToday?.[event as PushUsageEvent];
        return count === undefined ? [] : [[name, count]];
      })),
    },
    config: s.config,
    pendingMigrations: s.pendingMigrations,
    lastClosedAt: s.cycles.lastClosedAt,
    paymentMode: s.paymentMode,
    setupCompleted: s.setupCompleted,
    ...(s.push === undefined ? {} : { push: s.push }),
  };
}
