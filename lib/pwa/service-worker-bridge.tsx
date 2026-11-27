"use client";

import { useEffect, type ReactNode } from "react";
import { hasUnsavedChanges } from "./use-unsaved-changes";
import { parseInternalPath } from "./safe-internal-path";
import type { workerMode } from "./worker-mode";

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

type Usage = "pwa_launch_standalone" | "pwa_launch_browser" | "push_opened";

export function ServiceWorkerBridge({
  mode, title, open, router, toast, allowPath, fallbackPath, recordUsage,
  openedParam, openedMessage = "flylabs:push-opened", recordHandledOpen = true,
}: {
  mode: ReturnType<typeof workerMode>;
  title: string;
  open: string;
  router: { push: (url: string) => void };
  toast: {
    add: (input: { title: string; timeout: number; actionProps: { children: ReactNode; onClick: () => void } }) => string;
    close: (id: string) => void;
  };
  allowPath: (pathname: string) => boolean;
  fallbackPath: string;
  openedParam: string;
  openedMessage?: string;
  recordHandledOpen?: boolean;
  recordUsage?: (event: Usage) => Promise<unknown>;
}) {
  useEffect(() => {
    if (mode === "leave" || !navigator.serviceWorker) return;
    void updateRegistration(navigator.serviceWorker, mode).catch(() => {
      // The app remains usable if this browser cannot install the worker.
    });
  }, [mode]);

  useEffect(() => {
    if (!recordUsage) return;

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        launchRecorded = false;
        return;
      }
      if (launchRecorded) return;
      launchRecorded = true;
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      void recordUsage?.(standalone ? "pwa_launch_standalone" : "pwa_launch_browser").catch(() => {});
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has(openedParam)) {
      url.searchParams.delete(openedParam);
      window.history.replaceState(window.history.state, "", url);
      void recordUsage?.("push_opened").catch(() => {});
    }

    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [openedParam, recordUsage]);

  useEffect(() => {
    const workers = navigator.serviceWorker;
    if (!workers) return;

    function openFromWorker(event: MessageEvent) {
      if (event.source !== workers.controller) return;
      if (event.data?.type === openedMessage) {
        void recordUsage?.("push_opened").catch(() => {});
        return;
      }
      const port = event.ports[0];
      if (event.data?.type !== "flylabs:open" || !port) return;

      const origin = window.location.origin;
      const path = parseInternalPath(event.data.url, origin);
      const url = path && allowPath(new URL(path, origin).pathname) ? path : fallbackPath;

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
      if (recordHandledOpen) void recordUsage?.("push_opened").catch(() => {});
      port.postMessage("handled");
      port.close();
    }

    workers.addEventListener("message", openFromWorker);
    return () => workers.removeEventListener("message", openFromWorker);
  }, [allowPath, fallbackPath, open, openedMessage, recordHandledOpen, recordUsage, router, title, toast]);

  return null;
}
