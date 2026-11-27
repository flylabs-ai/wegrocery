import { brand } from "@/lib/brand";
import { escapeHtml } from "@/lib/email/layout";
import { t } from "@/lib/i18n";

export const dynamic = "force-static";

// This document needs no script, stylesheet, font or authenticated layout.
// One language per installation (brand.locale), like the rest of the app.
const name = escapeHtml(brand.appName);
const html = `<!doctype html>
<html lang="${brand.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(t.pwa.offlineTitle)} · ${name}</title>
</head>
<body style="color-scheme:light dark;font:1rem/1.5 system-ui,sans-serif;margin:0">
  <main style="max-width:32rem;margin:12vh auto;padding:1.5rem">
    <p>${name}</p>
    <h1>${escapeHtml(t.pwa.offlineTitle)}</h1>
    <p>${escapeHtml(t.pwa.offlineBody)}</p>
  </main>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
