// Checks a staging (Vercel preview) deploy the way a person would, from an
// agent's machine: waits for /api/health to show the expected version, signs
// in as the two test members through the preview sign-in
// (lib/auth/preview-login.ts), opens the main pages on an iPhone, an Android
// phone, an iPad and a desktop, saves a screenshot of each and runs axe.
//
// Read only: it opens pages and never presses a button that saves anything.
// Staging holds a copy of real data, so nothing it does may create orders,
// payments or movements.
//
//   STAGING_CHECK_URL=https://gas-staging.portamoneta.org \
//   PREVIEW_LOGIN_SECRET=... VERCEL_STAGING_BYPASS=... \
//   STAGING_CHECK_VERSION=1.51.0 STAGING_CHECK_OUT=/path/to/screens \
//   node scripts/staging-check.mjs
//
// VERCEL_STAGING_BYPASS is the "Protection Bypass for Automation" key the
// deploy's Deployment Protection asks for; it is sent only to the staging
// origin. Exit code 1 when a page fails to open or axe finds a serious
// problem; a Markdown summary goes to stdout (and to $GITHUB_STEP_SUMMARY).

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = (process.env.STAGING_CHECK_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.PREVIEW_LOGIN_SECRET ?? "";
const BYPASS = process.env.VERCEL_STAGING_BYPASS ?? "";
const VERSION = process.env.STAGING_CHECK_VERSION ?? "";
const OUT = process.env.STAGING_CHECK_OUT ?? "";
if (!BASE || !SECRET) {
  console.error("STAGING_CHECK_URL and PREVIEW_LOGIN_SECRET are required.");
  process.exit(2);
}
const ORIGIN = new URL(BASE).origin;

const PROFILES = {
  iphone: devices["iPhone 15"],
  android: devices["Pixel 7"],
  ipad: devices["iPad (gen 7)"],
  desktop: { viewport: { width: 1440, height: 900 } },
};
const PAGES = {
  user: ["/", "/ordine", "/storico", "/notifiche", "/profilo"],
  admin: ["/admin", "/admin?tab=cassa", "/admin?tab=soci", "/admin?tab=catalogo"],
};
const FAILING_IMPACT = new Set(["serious", "critical"]);

const failures = [];
const notes = [];

async function waitForVersion() {
  const headers = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`, { headers });
      const body = res.ok ? await res.json() : null;
      if (body?.ok && (!VERSION || body.version === VERSION)) return body.version;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) throw new Error(`health never showed ${VERSION || "ok"}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

async function newContext(browser, profile) {
  const ctx = await browser.newContext({ ...PROFILES[profile], locale: "it-IT" });
  // The bypass key goes to the staging origin only, never to fonts or others.
  if (BYPASS) {
    await ctx.route(`${ORIGIN}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": BYPASS } }),
    );
  }
  return ctx;
}

async function signIn(ctx, profile) {
  const res = await ctx.request.post(`${BASE}/api/auth/preview/sign-in`, {
    headers: {
      origin: ORIGIN,
      "x-preview-login-secret": SECRET,
      ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}),
    },
    data: { profile },
  });
  if (res.status() !== 200) throw new Error(`preview sign-in as ${profile}: HTTP ${res.status()}`);
}

async function shoot(page, path, file) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!res || res.status() >= 400) {
    failures.push(`${file}: HTTP ${res?.status() ?? "none"}`);
    return;
  }
  if (new URL(page.url()).pathname.startsWith("/login")) {
    failures.push(`${file}: sent back to the sign-in page`);
    return;
  }
  if (await page.locator("[data-app-render-error]").isVisible()) {
    failures.push(`${file}: the app rendered its error boundary`);
    return;
  }
  if (OUT) await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) failures.push(`${file}: the page scrolls horizontally`);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  for (const v of violations) {
    const line = `${file}: axe ${v.id} (${v.impact}, ${v.nodes.length}) ${v.help}`;
    (FAILING_IMPACT.has(v.impact) ? failures : notes).push(line);
  }
}

const slug = (path) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/[/?=&]+/g, "-"));

async function main() {
  const version = await waitForVersion();
  if (OUT) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const who of ["user", "admin"]) {
      for (const profile of Object.keys(PROFILES)) {
        const ctx = await newContext(browser, profile);
        try {
          await signIn(ctx, who);
          const page = await ctx.newPage();
          for (const path of PAGES[who]) await shoot(page, path, `${who}-${profile}-${slug(path)}`);
        } catch (e) {
          failures.push(`${who} on ${profile}: ${e.message}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const summary = [
    `## Staging check ${version}`,
    failures.length ? `### Failures (${failures.length})\n${failures.map((f) => `- ${f}`).join("\n")}` : "No failures.",
    notes.length ? `### Notes (${notes.length})\n${notes.map((n) => `- ${n}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
