"use client";

import { recordPushClientUsage } from "@/lib/actions/push-usage";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { hasUnsavedChanges } from "@/lib/pwa/use-unsaved-changes";
import { safeInternalPath } from "@/lib/auth/hosts";
import type { workerMode } from "@/lib/pwa/worker-mode";

async function updateRegistration(workers: ServiceWorkerContainer, mode: "register" | "remove") {
  const registration = await workers.getRegistration("/");
  const scope = new URL("/", window.location.origin).href;
  const script = new URL("/sw.js", scope).href;
  const worker = registration?.installing ?? registration?.waiting ?? registration?.active;
  const isAppWorker = registration?.scope === scope && worker?.scriptURL === script;

  if (mode === "remove") {
    if (isAppWorker) await registration.unregister();
  } else if (!isAppWorker || registration.updateViaCache !== "none") {
    await workers.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
}

// Shared across effect remounts while the document is still visible.
let launchRecorded = false;

function count(event: "pwa_launch_standalone" | "pwa_launch_browser" | "push_opened") {
  void recordPushClientUsage(event).catch(() => {});
}

export function ServiceWorkerBridge({ mode, title, open }: {
  mode: ReturnType<typeof workerMode>;
  title: string;
  open: string;
}) {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (mode === "leave" || !navigator.serviceWorker) return;
    void updateRegistration(navigator.serviceWorker, mode).catch(() => {
      // The app remains usable if this browser cannot install the worker.
    });
  }, [mode]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        launchRecorded = false;
        return;
      }
      if (launchRecorded) return;
      launchRecorded = true;
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      count(standalone ? "pwa_launch_standalone" : "pwa_launch_browser");
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has("_push_open")) {
      url.searchParams.delete("_push_open");
      window.history.replaceState(window.history.state, "", url);
      count("push_opened");
    }

    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const workers = navigator.serviceWorker;
    if (!workers) return;

    function openFromWorker(event: MessageEvent) {
      if (event.source !== workers.controller) return;
      if (event.data?.type === "flylabs:push-opened") {
        count("push_opened");
        return;
      }
      const port = event.ports[0];
      if (event.data?.type !== "flylabs:open" || !port) return;

      const path = safeInternalPath(event.data.url);
      const target = new URL(path, window.location.origin);
      const url = target.origin === window.location.origin ? path : "/";

      if (hasUnsavedChanges()) {
        const id = toast.add({
          title,
          timeout: 0,
          actionProps: {
            children: open,
            onClick: () => {
              toast.close(id);
              router.push(url);
            },
          },
        });
      } else {
        router.push(url);
      }
      count("push_opened");
      port.postMessage("handled");
      port.close();
    }

    workers.addEventListener("message", openFromWorker);
    return () => workers.removeEventListener("message", openFromWorker);
  }, [open, router, title, toast]);

  return null;
}
