import type { ReactNode } from "react";
import { cn, focusClass } from "../ui/cn";
export type PublicShellProps = {
  brand: ReactNode; actions?: ReactNode; footer?: ReactNode; children: ReactNode;
  skipLabel: string; mainId?: string; wide?: boolean;
  classNames?: { root?: string; header?: string; main?: string; footer?: string };
};
/** Language links, legal destinations and the brand remain slots from the app. */
export function PublicShell({ brand, actions, footer, children, skipLabel, mainId = "main", wide = false, classNames }: PublicShellProps) {
  return <div className={cn("flex min-h-dvh flex-col bg-background text-foreground", classNames?.root)}><a href={`#${mainId}`} className={cn("sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-(--control-radius) focus:bg-inverse focus:px-4 focus:py-2 focus:text-inverse-foreground", focusClass)}>{skipLabel}</a><header className={cn("flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]", classNames?.header)}>{brand}{actions}</header><main id={mainId} tabIndex={-1} className={cn("mx-auto w-full min-w-0 flex-1 px-4 py-10", wide ? "max-w-6xl" : "max-w-3xl", classNames?.main)}>{children}</main>{footer ? <footer className={cn("border-t border-border px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground", classNames?.footer)}>{footer}</footer> : null}</div>;
}
