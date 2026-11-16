"use client";
import { useEffect, type ReactNode, type Ref } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";
import { useSwipeDown } from "./use-swipe";

export type SheetContentProps = {
  title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
  closeLabel: string; onRequestClose: () => void; className?: string;
  size?: "sm" | "md" | "lg"; desktopFrom?: "sm" | "md";
  popupRef?: Ref<HTMLDivElement>; initialFocus?: Dialog.Popup.Props["initialFocus"];
  dragHandlers?: ReturnType<typeof useSwipeDown<HTMLDivElement>>["handlers"];
  swipeToClose?: boolean;
};
export function SheetHeading({ title, subtitle, closeLabel, onRequestClose }: Pick<SheetContentProps, "title" | "subtitle" | "closeLabel" | "onRequestClose">) {
  return <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3"><div className="min-w-0"><Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>{subtitle ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{subtitle}</Dialog.Description> : null}</div><Button size="icon" variant="ghost" aria-label={closeLabel} onClick={onRequestClose}><X aria-hidden="true" className="size-5" /></Button></header>;
}
/** Composable panel, also usable inside an application's own Dialog.Portal. */
export function SheetContent({ title, subtitle, children, footer, closeLabel, onRequestClose, className, size = "md", desktopFrom = "md", popupRef, initialFocus, dragHandlers, swipeToClose = true }: SheetContentProps) {
  return (
    <Dialog.Popup ref={popupRef} initialFocus={initialFocus} data-slot="sheet" className={cn(
      "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-(--radius) border border-border bg-card text-card-foreground",
      desktopFrom === "sm" ? "sm:inset-y-0 sm:my-auto sm:h-fit sm:max-h-[88dvh] sm:rounded-(--radius)" : "md:inset-y-0 md:my-auto md:h-fit md:max-h-[88dvh] md:rounded-(--radius)",
      { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" }[size], className,
    )}>
      <div {...dragHandlers} data-slot="sheet-handle" className={cn("shrink-0", swipeToClose && (desktopFrom === "sm" ? "touch-none sm:touch-auto" : "touch-none md:touch-auto"))}>
        <div aria-hidden="true" className={cn("mx-auto mt-2 h-1 w-10 rounded-full bg-border", desktopFrom === "sm" ? "sm:hidden" : "md:hidden")} />
        <SheetHeading title={title} subtitle={subtitle} closeLabel={closeLabel} onRequestClose={onRequestClose} />
      </div>
      {children !== null && children !== undefined ? <div className={cn("flex-1 overflow-y-auto overscroll-contain p-4", !footer && "pb-[max(1rem,env(safe-area-inset-bottom))]")}>{children}</div> : null}
      {footer ? <footer className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
    </Dialog.Popup>
  );
}
export type SheetProps = Omit<SheetContentProps, "popupRef" | "dragHandlers"> & { open: boolean; backdropClassName?: string };
export function Sheet({ open, onRequestClose, swipeToClose = true, desktopFrom = "md", backdropClassName, ...props }: SheetProps) {
  const swipe = useSwipeDown<HTMLDivElement>(onRequestClose, swipeToClose, desktopFrom === "sm" ? 639 : 767);
  // Preserve the opener when a caller unmounts a controlled sheet on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { setTimeout(() => { if (opener?.isConnected && !document.querySelector('[role="dialog"]')) opener.focus(); }); };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onRequestClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cn("fixed inset-0 z-50 bg-inverse/40", backdropClassName)} />
        <SheetContent {...props} onRequestClose={onRequestClose} desktopFrom={desktopFrom} swipeToClose={swipeToClose} popupRef={swipe.target} dragHandlers={swipe.handlers} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function SheetActions({ children }: { children: ReactNode }) { return <div className="flex flex-col-reverse gap-2 sm:flex-row">{children}</div>; }
