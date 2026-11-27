"use client";

import { useEffect } from "react";
import { reconcilePushDevice } from "@/lib/push/reconcile-client";

const CHECK_INTERVAL_MS = 60_000;
let lastCheck: { personId: string; at: number } | undefined;

export function PushDeviceCheck({ personId }: { personId: string }) {
  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (lastCheck?.personId === personId && now - lastCheck.at < CHECK_INTERVAL_MS) return;
      lastCheck = { personId, at: now };
      void reconcilePushDevice().catch(() => {});
    }

    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [personId]);

  return null;
}
