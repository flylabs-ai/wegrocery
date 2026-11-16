"use client";

import { Bell } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { NavIcon } from "@/components/nav-icon";
import { isNotificationsPath, isProfilePath, visibleNavItems } from "@/components/nav-items";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav";
import { cn, focusClass } from "@/components/ui/cn";
import { ADMIN_GUIDE_HREF, adminHref, adminSectionsFor } from "@/lib/admin/nav";
import { t } from "@/lib/i18n";
import { initials } from "@/lib/profile/summary";
import { refreshAllowed } from "@/lib/ui/refresh";
import type { AdminAccess } from "@/lib/roles";

type AppNavProps = {
  admin: AdminAccess | null;
  unreadCount: number;
  name?: string | null;
  email: string;
  appName: string;
  logoUrl: string;
  showName: boolean;
  children: ReactNode;
};

/**
 * WeGrocery's navigation on the FlyLabs Kit shell 1.1: bottom bar on phones,
 * rail on tablets, sidebar from lg with Admin's sections under Admin. The
 * header keeps the group's logo, the bell and the avatar; the sidebar keeps
 * Notifications and Profile at the bottom. A tap on the current item goes back
 * to the top with fresh data, except on the order page.
 */
export function AppNav({ admin, unreadCount, name, email, appName, logoUrl, showName, children }: AppNavProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();

  const items: NavItem[] = visibleNavItems(admin !== null).map((item) => ({
    href: item.href,
    label: item.label,
    icon: <NavIcon name={item.icon} />,
    match: item.exact ? { exact: [item.href], sections: item.also ?? [] } : undefined,
    children:
      item.href === "/admin" && admin
        ? [
            ...[...adminSectionsFor(admin).primary, ...adminSectionsFor(admin).more].map((s) => ({
              href: adminHref(s.id),
              label: s.label,
              icon: null,
            })),
            { href: ADMIN_GUIDE_HREF, label: t.admin.nav.guide, icon: null },
          ]
        : undefined,
  }));

  const brand = (
    <Link href="/" aria-label={t.nav.home} className={cn("inline-flex min-h-11 items-center gap-2 rounded-(--control-radius)", focusClass)}>
      <Image src={logoUrl} alt={appName} width={26} height={26} priority className="h-[26px] w-auto shrink-0" />
      {showName && <span className="truncate text-[15px] font-semibold text-foreground">{appName}</span>}
    </Link>
  );

  // On the tablet rail only the logo fits; the name comes back with the sidebar.
  const sidebarHeader = (
    <Link href="/" aria-label={t.nav.home} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-(--control-radius) lg:justify-start lg:px-1", focusClass)}>
      <Image src={logoUrl} alt={appName} width={28} height={28} className="h-7 w-auto shrink-0" />
      {showName && <span className="hidden truncate text-[15px] font-semibold text-foreground lg:inline">{appName}</span>}
    </Link>
  );

  const footerLink = (active: boolean) =>
    cn(
      "flex min-h-(--control-h) flex-col items-center justify-center gap-1 rounded-(--control-radius) px-1 py-2 text-xs pointer-coarse:min-h-11 lg:flex-row lg:justify-start lg:gap-2 lg:px-3 lg:text-sm",
      focusClass,
      active ? "bg-secondary text-primary-text" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );
  const bellCurrent = isNotificationsPath(pathname);
  const profileCurrent = isProfilePath(pathname);

  return (
    <AppShell
      items={items}
      pathname={pathname}
      search={search}
      wideFrom="lg"
      labels={{ skip: t.common.skipToContent, navigation: t.nav.mainAria, more: t.admin.nav.more, close: t.common.close }}
      brand={brand}
      sidebarHeader={sidebarHeader}
      actions={
        <>
          <NotificationBell unreadCount={unreadCount} />
          <ProfileAvatar name={name} email={email} />
        </>
      }
      sidebarFooter={
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <Link
            href="/notifiche"
            aria-current={bellCurrent ? "page" : undefined}
            aria-label={unreadCount > 0 ? t.notifications.unreadCountLabel(unreadCount) : t.notifications.title}
            className={footerLink(bellCurrent)}
          >
            <span className="relative">
              <Bell aria-hidden className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-0.75 text-label leading-none font-bold text-danger-foreground tabular-nums">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span>{t.notifications.title}</span>
          </Link>
          <Link href="/profilo" aria-current={profileCurrent ? "page" : undefined} className={footerLink(profileCurrent)}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-label font-black tracking-tight text-primary-foreground">
              {initials(name, email)}
            </span>
            <span className="max-w-full truncate">{t.profile.title}</span>
          </Link>
        </div>
      }
      onReselect={() => {
        if (!refreshAllowed(pathname)) return;
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        router.refresh();
      }}
    >
      {children}
    </AppShell>
  );
}
