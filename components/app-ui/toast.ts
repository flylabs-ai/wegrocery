"use client";

import { createToastManager } from "@/components/ui/toast";
import type { ReactNode } from "react";

/**
 * WeGrocery's toast calls on the kit's Base UI Toast (FlyLabs Kit ui 1.1).
 * One manager for the app, passed to the ToastProvider in app/layout.tsx.
 * Errors and warnings must be read, not raced: they stay 8 s. Success and
 * info keep 3 s. A call that passes its own duration still wins; an id
 * replaces the toast already shown under that id.
 */
export const toastManager = createToastManager();

type Type = "success" | "error" | "warning" | "info";
export type ToastOptions = { id?: string; duration?: number; description?: string };

const SHORT = 3000;
const LASTING = 8000;

// The toast last shown under each caller id: showing again closes it first.
const shown = new Map<string, string>();

function show(type: Type, title: ReactNode, { id, duration, description }: ToastOptions = {}): string {
  const timeout = duration ?? (type === "error" || type === "warning" ? LASTING : SHORT);
  const previous = id ? shown.get(id) : undefined;
  if (previous) toastManager.close(previous);
  const added = toastManager.add({ title, description, type, timeout });
  if (id) shown.set(id, added);
  return added;
}

export const toast = {
  success: (title: ReactNode, options?: ToastOptions) => show("success", title, options),
  error: (title: ReactNode, options?: ToastOptions) => show("error", title, options),
  warning: (title: ReactNode, options?: ToastOptions) => show("warning", title, options),
  info: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
  message: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
  dismiss: (id?: string) => toastManager.close(id === undefined ? undefined : (shown.get(id) ?? id)),
};
