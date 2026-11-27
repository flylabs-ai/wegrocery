import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";

// This script uses an app started with pwa-browser-fixtures.mjs.

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const app = process.env.PWA_CHECK_URL ?? "http://127.0.0.1:3847";
// Use the full Chromium browser in CI, matching the worker lifecycle of the
// local Chrome run. Playwright's separate headless shell restarts these workers.
const launch = () => chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : { channel: "chromium" });
const next = "/ordine?cycleId=synthetic&_push_open=1";

test("public manifest and scripts preserve install identity without cookies", async () => {
  const response = await fetch(app + "/manifest.webmanifest", { redirect: "manual" });
  assert.equal(response.status, 200);
  const { name, short_name, id, scope, start_url, orientation, icons } = await response.json();
  assert.ok(name && short_name && icons.length);
  assert.deepEqual({ id, scope, start_url, orientation }, { id: "/", scope: "/", start_url: "/", orientation: undefined });
  for (const path of ["/sw.js", "/sw-core.js"]) {
    const worker = await fetch(app + path, { redirect: "manual" });
    assert.equal(worker.status, 200);
    assert.equal(worker.headers.get("location"), null);
    assert.equal(worker.headers.get("content-security-policy"), null);
    assert.match(worker.headers.get("content-type"), /javascript/);
    assert.match(worker.headers.get("cache-control"), /no-store/);
  }
});

test("WGR-06 keeps the notification deep link through OTP and Google handoff", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    page.setDefaultTimeout(15_000);
    const landing = app + next;
    let googleCallback;
    await page.route(app + "/api/auth/sign-in/magic-link", (route) => {
      assert.equal(route.request().postDataJSON().callbackURL, next);
      return route.fulfill({ json: {} });
    });
    await page.route(app + "/api/auth/sign-in/email-otp", (route) => route.fulfill({ json: {} }));
    await page.route(app + "/api/auth/sign-in/social", (route) => {
      googleCallback = route.request().postDataJSON().callbackURL;
      return route.fulfill({ json: { url: app + "/synthetic-google-return" } });
    });
    await page.route(app + "/synthetic-google-return", (route) => {
      assert.equal(googleCallback, next);
      return route.fulfill({
        contentType: "text/html",
        body: '<meta http-equiv="refresh" content="0;url=' + googleCallback.replaceAll("&", "&amp;") + '">',
      });
    });
    await page.goto(landing);
    const login = page.url();
    assert.equal(new URL(login).searchParams.get("next"), next);
    await page.route(landing, (route) => route.fulfill({ body: "Synthetic order" }));
    await page.locator("#email").fill("member@example.test");
    await page.locator('form button[type="submit"]').click();
    await page.locator("#code").fill("123456");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(landing);
    await page.goto(login);
    await page.locator('main form + p + button').click();
    await page.waitForURL(landing);
  } finally {
    await browser.close();
  }
});

test("the real bridge presents a notification action without discarding dirty input", async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(app + "/login");
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.locator("#email").fill("draft@example.test");
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await worker.evaluate(async () => {
      const event = new Event("notificationclick");
      let handled;
      Object.assign(event, {
        notification: { data: { url: "/ordine?cycleId=synthetic" }, close() {} },
        waitUntil: (promise) => { handled = promise; },
      });
      self.dispatchEvent(event);
      // A synthetic click has no OS user activation, so Chromium can refuse
      // WindowClient.focus() after the page has acknowledged the message.
      await handled.catch((error) => {
        if (error.name !== "InvalidAccessError") throw error;
      });
    });
    await page.getByRole("button", { name: /^(Open|Apri|Abrir|Ouvrir)$/ }).waitFor();
    assert.equal(await page.locator("#email").inputValue(), "draft@example.test");
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal(context.pages().length, 1);
  } finally {
    await browser.close();
  }
});

test("the real order Server Action reports an offline error and stays unsent on reconnect", async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const fixture = app + "/login/w7-browser-order";
    const order = await page.goto(fixture);
    assert.equal(order.status(), 200);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const confirmOrder = page.getByRole("button", { name: /^(Confirm order|Conferma ordine|Confirmar pedido|Confirmer la commande)$/i }).first();
    await confirmOrder.waitFor();
    let reconnectPosts = 0;
    let reconnected = false;
    page.on("request", (request) => {
      if (reconnected && request.method() === "POST" && request.url() === fixture) reconnectPosts++;
    });
    await context.setOffline(true);
    await confirmOrder.click();
    await page.getByText(/^(Order not saved|Ordine non salvato|Pedido no guardado|Commande non enregistrée)/).waitFor();
    reconnected = true;
    await context.setOffline(false);
    // Allow the draft's autosave debounce to elapse after reconnect.
    await page.waitForTimeout(1_000);
    assert.equal(reconnectPosts, 0);
    assert.equal(page.url(), fixture);
  } finally {
    await browser.close();
  }
});

test("worker refresh keeps an open draft and the worker preserves offline and HTTP error semantics", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const core = await readFile(new URL("../public/sw-core.js", import.meta.url), "utf8");
  const offline = await (await fetch(app + "/offline")).text();
  assert.match(offline, /<main/);
  let version = 1;
  let posts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/sw.js" || req.url === "/sw-core.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      res.end(req.url === "/sw.js" ? worker + "\n// Revision " + version : core);
    } else if (req.url === "/offline") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(offline);
    } else if (req.url === "/error") {
      res.writeHead(500).end("Synthetic application error");
    } else if (req.method === "POST") {
      posts++;
      res.end("saved");
    } else {
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        '<input id="draft" aria-label="Draft"><button id="save">Save</button><output id="error" role="status"></output>' +
        '<script>save.onclick=async()=>{try { await fetch("/draft",{method:"POST",headers:{"Next-Action":"synthetic"},body:draft.value}); } catch { error.textContent="Save failed"; }}</script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await launch();
  try {
    const context = await browser.newContext({ permissions: ["notifications"] });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(origin + "/draft");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), origin + "/sw.js");
    await page.locator("#draft").fill("Unsaved synthetic order");
    await page.evaluate(() => {
      window.draftDocument = true;
      window.previousController = navigator.serviceWorker.controller;
    });
    version++;
    await page.evaluate(() => {
      void navigator.serviceWorker.ready.then((registration) => registration.update()).catch((error) => {
        window.updateError = String(error);
      });
    });
    await page.waitForFunction(() => window.updateError ||
      (navigator.serviceWorker.controller && navigator.serviceWorker.controller !== window.previousController));
    assert.equal(await page.evaluate(() => window.updateError), undefined);
    assert.equal(await page.evaluate(() => window.draftDocument), true);
    assert.equal(await page.locator("#draft").inputValue(), "Unsaved synthetic order");

    // A fresh browser context avoids carrying the previous controller's
    // network interception into the offline and HTTP error checks.
    await context.close();
    const offlineContext = await browser.newContext();
    const offlinePage = await offlineContext.newPage();
    offlinePage.setDefaultTimeout(15_000);
    await offlinePage.goto(origin + "/draft");
    await offlinePage.evaluate(() => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
    await offlinePage.waitForFunction(() => navigator.serviceWorker.controller);
    await offlineContext.setOffline(true);
    await offlinePage.locator("#save").click();
    await offlinePage.waitForFunction(() => document.querySelector("#error").textContent === "Save failed");
    await offlineContext.setOffline(false);
    assert.equal(posts, 0);
    await offlineContext.setOffline(true);
    await offlinePage.goto(origin + "/missing-offline");
    assert.equal(await offlinePage.locator("main").count(), 1);
    assert.equal(await offlinePage.title(), /<title>(.*?)<\/title>/.exec(offline)[1]);
    assert.deepEqual(await offlinePage.evaluate(() => caches.keys()), ["offline-v1"]);
    await offlineContext.setOffline(false);
    const error = await offlinePage.goto(origin + "/error");
    assert.equal(error.status(), 500);
    assert.equal(await offlinePage.locator("body").innerText(), "Synthetic application error");
    assert.equal(posts, 0);
  } finally {
    await browser.close();
    server.close();
  }
});
