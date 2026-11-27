"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { recordPushClientUsage } from "@/lib/actions/push-usage";
import { ServiceWorkerBridge as KitBridge } from "@/lib/pwa/service-worker-bridge";
import type { workerMode } from "@/lib/pwa/worker-mode";

const allowPath = () => true;

export function ServiceWorkerBridge(props: {
  mode: ReturnType<typeof workerMode>;
  title: string;
  open: string;
}) {
  const router = useRouter();
  const toast = useToast();

  return (
    <KitBridge
      {...props}
      router={router}
      toast={toast}
      allowPath={allowPath}
      fallbackPath="/"
      openedParam="_push_open"
      recordUsage={recordPushClientUsage}
    />
  );
}
