"use client";
import { useRef, type ReactNode, type Ref } from "react";
import { Button } from "./button";
import { Sheet, SheetActions } from "./sheet";
export type ConfirmActionsProps = {
  confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void;
  danger?: boolean; pending?: boolean; cancelRef?: Ref<HTMLButtonElement>; confirmRef?: Ref<HTMLButtonElement>;
};
export function ConfirmActions({ confirmLabel, cancelLabel, onConfirm, onCancel, danger = false, pending = false, cancelRef, confirmRef }: ConfirmActionsProps) {
  return <SheetActions><Button ref={cancelRef} variant="outline" block onClick={onCancel}>{cancelLabel}</Button><Button ref={confirmRef} variant={danger ? "destructive" : "default"} block disabled={pending} onClick={onConfirm}>{confirmLabel}</Button></SheetActions>;
}
/** Controlled state belongs to the app; no global listener, product messages or window dialog. */
export function ConfirmDialog({ open, title, message, closeLabel, confirmLabel, cancelLabel, onConfirm, onCancel, danger = false, pending = false, desktopFrom = "md" }: Omit<ConfirmActionsProps, "cancelRef" | "confirmRef"> & { open: boolean; title: ReactNode; message?: ReactNode; closeLabel: string; desktopFrom?: "sm" | "md" }) {
  const cancel = useRef<HTMLButtonElement>(null); const confirm = useRef<HTMLButtonElement>(null);
  return <Sheet open={open} title={title} subtitle={message} closeLabel={closeLabel} onRequestClose={onCancel} desktopFrom={desktopFrom} size="sm" initialFocus={danger || pending ? cancel : confirm} footer={<ConfirmActions confirmLabel={confirmLabel} cancelLabel={cancelLabel} onConfirm={onConfirm} onCancel={onCancel} danger={danger} pending={pending} cancelRef={cancel} confirmRef={confirm} />}>{null}</Sheet>;
}
