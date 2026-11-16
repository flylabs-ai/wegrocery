"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { t } from "@/lib/i18n";

/**
 * WeGrocery's promise-based confirm on the kit's controlled ConfirmDialog
 * (FlyLabs Kit ui 1.1): `await confirm({...})` anywhere in the app, one
 * provider mounted in app/layout.tsx.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Request = ConfirmOptions & { resolve: (value: boolean) => void };

let listener: ((req: Request) => void) | null = null;
let open = false;

/**
 * Whether a confirm is on screen. A Sheet under it (components/app-ui/sheet)
 * ignores the Esc and the taps that belong to the confirm.
 */
export function isConfirmOpen(): boolean {
  return open;
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Provider not mounted (SSR or before hydration): treated as "cancelled".
    if (!listener) return resolve(false);
    listener({ ...options, resolve });
  });
}

/** Asked before a sheet holding unsaved work closes: true means close anyway. */
export function confirmDiscard(): Promise<boolean> {
  return confirm({
    title: t.common.discardTitle,
    message: t.common.discardMessage,
    confirmLabel: t.common.discardConfirm,
    cancelLabel: t.common.keepEditing,
    danger: true,
  });
}

export function ConfirmDialogProvider() {
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    listener = (req) => {
      open = true;
      setRequest(req);
    };
    return () => {
      listener = null;
    };
  }, []);

  function close(result: boolean) {
    if (!request) return;
    request.resolve(result);
    setRequest(null);
    // The same tap or Esc also reaches the sheet below: it is still the
    // confirm's until this event is over.
    setTimeout(() => {
      open = false;
    });
  }

  return (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      message={request?.message}
      danger={request?.danger === true}
      closeLabel={t.common.close}
      confirmLabel={request?.confirmLabel ?? t.common.confirm}
      cancelLabel={request?.cancelLabel ?? t.common.cancel}
      desktopFrom="sm"
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
}
