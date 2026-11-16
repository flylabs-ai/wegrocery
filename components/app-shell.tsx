import { Suspense, type ReactNode } from "react";
import { getBrand } from "@/lib/brand/get-brand";
import { t } from "@/lib/i18n";
import { DemoBanner } from "@/components/demo-banner";
import { AppNav } from "@/components/app-nav";
import { CONTENT_WIDTH, type ShellLayout } from "@/components/shell-width";
import { WelcomeResume } from "@/components/home/welcome-resume";
import { AppRefresh } from "@/components/app-refresh";
import { NamePrompt } from "@/components/name-prompt";
import { TermsPrompt } from "@/components/terms-prompt";
import { termsPending } from "@/lib/members/terms-gate";
import { getPaymentSettings } from "@/lib/payments/get-settings";
import { signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getUnreadNotificationCount, notificationOwners } from "@/lib/db/queries";
import { namePromptFor } from "@/lib/members/name-prompt";
import type { AdminAccess } from "@/lib/roles";

type AppShellProps = {
  children: ReactNode;
  email: string;
  /** The signed-in person's name, for the avatar's initials (session.user.fullName). */
  name?: string | null;
  /** How much of Admin the person may open (lib/auth/access.ts adminAccess): the Admin item and its sections. */
  admin: AdminAccess | null;
  memberId: string;
  /** Who signed in, when they work on a family's account: their own notifications count too. */
  personId?: string | null;
  /** From lg: a reading column (the default) or the whole card (Home, Admin). */
  layout?: ShellLayout;
};

export async function AppShell({ children, email, name, admin, memberId, personId, layout = "reading" }: AppShellProps) {
  const brand = await getBrand();
  const [unreadCount, namePrompt, mustAccept, settings] = await Promise.all([
    getUnreadNotificationCount(notificationOwners(memberId, personId)),
    // A member still named after their address answers first (lib/members/name.ts).
    namePromptFor(personId ?? memberId),
    // The group's privacy notice and terms come before anything (lib/members/terms.ts).
    termsPending(personId ?? memberId),
    getPaymentSettings(),
  ]);
  const signOutAction = async () => {
    "use server";
    await signOut();
    redirect("/login");
  };
  const blocking = mustAccept || namePrompt !== null;

  return (
    // The kit shell (components/app-nav.tsx) is a client component: it reads
    // the URL for the current item and Admin's section.
    <Suspense>
      <AppNav
        admin={admin}
        unreadCount={unreadCount}
        name={name}
        email={email}
        appName={brand.appName}
        logoUrl={brand.logoUrl}
        showName={brand.headerShowName}
      >
        {/* Edge to edge at the top of the content, as the header's strip was. */}
        <div className="-mx-4 -mt-4 mb-4 empty:hidden md:-mx-6 md:-mt-6 md:mb-6">
          <DemoBanner />
        </div>
        <AppRefresh />
        {!blocking && <WelcomeResume />}
        <div className={CONTENT_WIDTH[layout]}>
          {mustAccept && settings.termsVersion ? (
            <TermsPrompt
              group={brand.appName}
              version={settings.termsVersion}
              privacyUrl={brand.privacyUrl}
              termsUrl={brand.termsUrl}
              signOut={signOutAction}
            />
          ) : namePrompt ? (
            <NamePrompt currentName={name ?? ""} required={namePrompt === "required"} signOut={signOutAction} />
          ) : (
            children
          )}
          {brand.privacyUrl || brand.termsUrl ? (
            <p className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs">
              {brand.privacyUrl ? (
                <a href={brand.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-secondary-foreground underline">
                  {t.login.privacyLink}
                </a>
              ) : null}
              {brand.termsUrl ? (
                <a href={brand.termsUrl} target="_blank" rel="noopener noreferrer" className="text-secondary-foreground underline">
                  {t.login.termsLink}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </AppNav>
    </Suspense>
  );
}
