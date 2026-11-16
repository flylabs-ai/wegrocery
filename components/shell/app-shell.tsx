"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { cn, focusClass } from "../ui/cn";
import { activeItem, mobileNavigation, type NavItem } from "./nav";

export type ShellLabels = { skip: string; navigation: string; more: string; close: string };
export type AppShellProps = {
  items: readonly NavItem[]; pathname: string; search?: string; onReselect?: (item: NavItem) => void; labels: ShellLabels; children: ReactNode;
  brand?: ReactNode; actions?: ReactNode; sidebarHeader?: ReactNode; sidebarFooter?: ReactNode; moreContent?: ReactNode;
  mainId?: string; mobileCount?: number; wideFrom?: "lg" | "xl";
  classNames?: { root?: string; header?: string; sidebar?: string; main?: string; link?: string; activeLink?: string; bottom?: string };
};
function NavLink({ item, active, currentPage = active, pathname, onReselect, bottom = false, menu = false, wideFrom = "xl", onClick, classNames }: {
  item: NavItem; active: boolean; currentPage?: boolean; pathname: string; onReselect?: AppShellProps["onReselect"]; bottom?: boolean; menu?: boolean; wideFrom?: "lg" | "xl"; onClick?: () => void; classNames?: AppShellProps["classNames"];
}) {
  return <Link href={item.href} aria-label={item.ariaLabel} aria-current={currentPage ? "page" : undefined} onClick={(event) => {
    onClick?.();
    if (onReselect && active && pathname === item.href.split(/[?#]/)[0] && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); onReselect(item);
    }
  }} className={cn(
    "flex min-h-(--control-h) items-center gap-2 rounded-(--control-radius) px-3 py-2 text-sm pointer-coarse:min-h-11", focusClass,
    menu ? "flex-row" : bottom ? "min-h-16 flex-1 flex-col justify-center gap-1 px-1 text-xs" : wideFrom === "xl" ? "flex-col justify-center px-1 text-xs xl:flex-row xl:justify-start xl:px-3 xl:text-sm" : "flex-col justify-center px-1 text-xs lg:flex-row lg:justify-start lg:px-3 lg:text-sm",
    active ? cn("bg-secondary text-primary-text", classNames?.activeLink) : "text-muted-foreground hover:bg-secondary hover:text-foreground", classNames?.link,
  )}><span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">{item.icon}</span><span>{item.label}</span>{item.badge !== undefined ? <span className="text-xs tabular-nums">{item.badge}</span> : null}</Link>;
}
function SidebarItem({ item, current, pathname, search, onReselect, wideFrom, classNames, nested = false }: {
  item: NavItem; current: NavItem | null; pathname: string; search?: string; onReselect?: AppShellProps["onReselect"];
  wideFrom: "lg" | "xl"; classNames?: AppShellProps["classNames"]; nested?: boolean;
}) {
  const active = current === item;
  const child = active ? activeItem(pathname, item.children ?? [], search) : null;
  return <div>
    <NavLink item={item} active={active} currentPage={active && child === null} pathname={pathname} onReselect={onReselect} wideFrom={wideFrom} menu={nested} classNames={classNames} />
    {active && item.children?.length ? <div className={cn("ml-3 flex-col gap-1 border-l border-border pl-3", wideFrom === "lg" ? "hidden lg:flex" : "hidden xl:flex")}>
      {item.children.map((entry) => <SidebarItem key={entry.href} item={entry} current={child} pathname={pathname} search={search} onReselect={onReselect} wideFrom={wideFrom} classNames={classNames} nested />)}
    </div> : null}
  </div>;
}
/** Product guards, session data, refresh, switchers and menus are caller-owned. */
export function AppShell({ items, pathname, search, onReselect, labels, children, brand, actions, sidebarHeader, sidebarFooter, moreContent, mainId = "main", mobileCount, wideFrom = "xl", classNames }: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null); const bottomBar = useRef<HTMLElement>(null);
  useEffect(() => {
    const shell = root.current; const bar = bottomBar.current;
    if (!shell || !bar) return;
    const documentRoot = shell.ownerDocument.documentElement;
    const previous = documentRoot.style.getPropertyValue("--app-bottom");
    const priority = documentRoot.style.getPropertyPriority("--app-bottom");
    let published = "";
    const measure = () => {
      shell.style.setProperty("--shell-bottom", `${bar.getBoundingClientRect().height}px`);
      const next = getComputedStyle(shell).getPropertyValue("--app-bottom").trim();
      if (next === published) return;
      published = next;
      // Body portals, including bottom toasts, share the shell's measured offset.
      documentRoot.style.setProperty("--app-bottom", published);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(bar, { box: "border-box" });
    return () => {
      observer.disconnect();
      if (documentRoot.style.getPropertyValue("--app-bottom") === published) {
        if (previous) documentRoot.style.setProperty("--app-bottom", previous, priority);
        else documentRoot.style.removeProperty("--app-bottom");
      }
    };
  }, []);
  const current = activeItem(pathname, items, search);
  const currentChild = current ? activeItem(pathname, current.children ?? [], search) : null;
  const mobile = mobileNavigation(items, mobileCount);
  const hasMore = mobile.more.length > 0 || (moreContent !== undefined && moreContent !== null && moreContent !== false);
  // Reserve a slot for More when the app supplies menu content alongside five links.
  const primary = hasMore && mobile.primary.length === 5 ? mobile.primary.slice(0, 4) : mobile.primary;
  const more = hasMore && mobile.primary.length === 5 ? [...mobile.primary.slice(4), ...mobile.more] : mobile.more;
  const moreActive = current !== null && more.includes(current);
  return (
    <div ref={root} className={cn("min-h-dvh bg-background text-foreground [--app-bottom:var(--shell-bottom,calc(4rem+1px+env(safe-area-inset-bottom)))] md:[--app-bottom:0px] md:flex", classNames?.root)}>
      <a href={`#${mainId}`} className={cn("sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-(--control-radius) focus:bg-inverse focus:px-4 focus:py-2 focus:text-inverse-foreground", focusClass)}>{labels.skip}</a>
      <aside className={cn("sticky top-0 hidden h-dvh w-20 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card px-2 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] md:flex", wideFrom === "xl" ? "xl:w-56 xl:px-4" : "lg:w-56 lg:px-4", classNames?.sidebar)}>
        {sidebarHeader ?? brand}
        <nav aria-label={labels.navigation} className="flex flex-col gap-1">{items.map((item) => <SidebarItem key={item.href} item={item} current={current} pathname={pathname} search={search} onReselect={onReselect} wideFrom={wideFrom} classNames={classNames} />)}</nav>
        {sidebarFooter ? <div className="mt-auto">{sidebarFooter}</div> : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn("flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden", classNames?.header)}><div className="min-w-0">{brand}</div><div className="flex shrink-0 items-center gap-2">{actions}</div></header>
        <main id={mainId} tabIndex={-1} className={cn("min-w-0 flex-1 px-4 py-4 pb-[calc(var(--app-bottom)+1rem)] md:px-6 md:py-6", classNames?.main)}>{children}</main>
      </div>
      <nav aria-label={labels.navigation} data-bottom-bar="" ref={bottomBar} className={cn("fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] md:hidden", classNames?.bottom)}>
        {primary.map((item) => <NavLink key={item.href} item={item} active={current === item} currentPage={current === item && currentChild === null} pathname={pathname} onReselect={onReselect} bottom classNames={classNames} />)}
        {hasMore ? <Button variant="ghost" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={cn("min-h-16 flex-1 flex-col px-1 py-2 text-xs", moreActive && "bg-secondary text-primary-text")}><Ellipsis aria-hidden="true" className="size-5" /><span>{labels.more}</span></Button> : null}
      </nav>
      {hasMore ? <Sheet open={moreOpen} onRequestClose={() => setMoreOpen(false)} title={labels.more} closeLabel={labels.close}><nav aria-label={labels.more} className="flex flex-col gap-2">{more.map((item) => <NavLink key={item.href} item={item} active={current === item} currentPage={current === item && currentChild === null} pathname={pathname} onReselect={onReselect} menu onClick={() => setMoreOpen(false)} classNames={classNames} />)}</nav>{moreContent}</Sheet> : null}
    </div>
  );
}
