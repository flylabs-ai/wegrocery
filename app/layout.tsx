import type { Metadata, Viewport } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/components/app-ui/toaster";
import { ConfirmDialogProvider } from "@/components/app-ui/confirm";
import { cookies } from "next/headers";
import { brand, roleVarsCss } from "@/lib/brand";
import { brandToTokens, statusBarColors } from "@/lib/brand/tokens";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { getBrand } from "@/lib/brand/get-brand";
import { pwaIcons } from "@/lib/pwa-icons";
import { ServiceWorkerBridge } from "@/components/service-worker-bridge";
import { workerMode } from "@/lib/pwa/worker-mode";
import { t } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// The identity the admins may have changed in the app (getBrand), read per
// request; language stays the deploy's.
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return {
    title: {
      default: b.appName,
      template: `%s · ${b.shortName}`,
    },
    description: b.description,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: b.shortName,
    },
    formatDetection: { telephone: false },
  };
}

function themeColors(chosen: Theme, bar: { light: string; dark: string }): Viewport["themeColor"] {
  if (chosen === "light") return bar.light;
  if (chosen === "dark") return bar.dark;
  return [
    { media: "(prefers-color-scheme: light)", color: bar.light },
    { media: "(prefers-color-scheme: dark)", color: bar.dark },
  ];
}

export async function generateViewport(): Promise<Viewport> {
  const b = await getBrand();
  const chosen = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    // The safe-area insets (env(safe-area-inset-*)) are only non-zero with "cover".
    viewportFit: "cover",
    // The browser's own bar: the page's background in each theme, never the
    // group's colour, so the system's icons stay readable with any brand
    // (decision 3c of the kit plan). With no choice made the device decides,
    // so both are offered.
    themeColor: themeColors(chosen, statusBarColors(brandToTokens(b.theme))),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const b = await getBrand();
  const chosen = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={brand.locale}
      data-theme={chosen === "system" ? undefined : chosen}
      className={`${geistSans.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: roleVarsCss(b.theme) }} />
        <link rel="apple-touch-icon" sizes={pwaIcons.appleTouch.sizes} href={pwaIcons.appleTouch.url} />
      </head>
      <body className="text-foreground flex min-h-full flex-col">
        <AppToaster>
          {children}
          <ConfirmDialogProvider />
          <ServiceWorkerBridge
            mode={workerMode(process.env.PWA_SW_ENABLED)}
            title={t.pwa.notificationReady}
            open={t.pwa.openNotification}
          />
        </AppToaster>
      </body>
    </html>
  );
}
