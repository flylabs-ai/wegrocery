"use client";
import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn, focusClass } from "./cn";
export const createToastManager = Toast.createToastManager;
export const useToast = Toast.useToastManager;
export type ToastProviderProps = {
  closeLabel: string; viewportLabel: string; children: ReactNode; timeout?: number; limit?: number;
  position?: "top" | "bottom";
  manager?: ReturnType<typeof createToastManager>;
  classNames?: { viewport?: string; root?: string; title?: string; description?: string; action?: string; close?: string };
};
export function ToastProvider({ closeLabel, viewportLabel, children, timeout = 5000, limit = 3, position = "top", manager, classNames }: ToastProviderProps) {
  return <Toast.Provider timeout={timeout} limit={limit} toastManager={manager}>{children}<Toast.Portal><Toast.Viewport aria-label={viewportLabel} className={cn("fixed inset-x-4 z-50 mx-auto flex max-w-sm flex-col gap-2", position === "top" ? "top-[max(1rem,env(safe-area-inset-top))]" : "bottom-[max(1rem,env(safe-area-inset-bottom),var(--app-bottom,0px))] sm:right-6 sm:left-auto", classNames?.viewport)}><ToastList closeLabel={closeLabel} position={position} classNames={classNames} /></Toast.Viewport></Toast.Portal></Toast.Provider>;
}
function ToastList({ closeLabel, position, classNames }: Pick<ToastProviderProps, "closeLabel" | "classNames"> & { position: "top" | "bottom" }) {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const Icon = toast.type === "success" ? CircleCheck : toast.type === "error" ? CircleAlert : toast.type === "warning" ? TriangleAlert : Info;
    return (
      <Toast.Root key={toast.id} toast={toast} swipeDirection={position === "top" ? "up" : ["down", "right"]} className={cn("flex items-start gap-3 rounded-(--radius) border border-border bg-card p-3 text-sm text-foreground data-[limited]:hidden", position === "top" ? "motion-safe:transition-[transform,translate,opacity] data-[starting-style]:-translate-y-full data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-full data-[ending-style]:opacity-0" : "motion-safe:transition-transform", classNames?.root)}>
        <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <Toast.Content className="min-w-0 flex-1"><Toast.Title className={cn("font-medium", classNames?.title)} /><Toast.Description className={cn("text-muted-foreground", classNames?.description)} /></Toast.Content>
        {toast.actionProps ? <Toast.Action className={cn("min-h-(--control-h) rounded-(--control-radius) px-2 text-primary-text pointer-coarse:min-h-11", focusClass, classNames?.action)} /> : null}
        <Toast.Close aria-label={closeLabel} className={cn("flex min-h-(--control-h) min-w-(--control-h) shrink-0 items-center justify-center rounded-(--control-radius) text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11", focusClass, classNames?.close)}><X aria-hidden="true" className="size-4" /></Toast.Close>
      </Toast.Root>
    );
  });
}
