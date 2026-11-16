"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { t } from "@/lib/i18n";
import { toastManager } from "./toast";

/** The kit's toasts (FlyLabs Kit ui 1.1), at the top, fed by components/app-ui/toast. */
export function AppToaster({ children }: { children: ReactNode }) {
  return (
    <ToastProvider manager={toastManager} closeLabel={t.common.close} viewportLabel={t.common.notices}>
      {children}
    </ToastProvider>
  );
}
