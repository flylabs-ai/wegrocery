// WeGrocery service worker v1.
const OFFLINE_PATH = "/offline";
const OFFLINE_CACHE = "offline-v1";
const FALLBACK_NOTICE = { title: "WeGrocery", body: "You have a new notification", url: "/" };

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(new URL(OFFLINE_PATH, self.location.origin), {
      cache: "reload",
      redirect: "error",
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("offline-v") && name !== OFFLINE_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  const target = new URL(request.url);
  if (target.origin !== self.location.origin || target.pathname === "/api" || target.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    return (await cache.match(OFFLINE_PATH)) ?? Response.error();
  }));
});

// Keep in sync with safeInternalPath in lib/auth/hosts.ts. Return null here so an unsafe push URL triggers the generic notice.
function safeInternalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  try {
    return new URL(value, self.location.origin).origin === self.location.origin ? value : null;
  } catch {
    return null;
  }
}

function readNotice(message) {
  let data;
  try {
    data = message?.json();
  } catch {
    return FALLBACK_NOTICE;
  }
  const url = safeInternalPath(data?.url);
  if (typeof data?.title !== "string" || !data.title || typeof data.body !== "string" || !url) {
    return FALLBACK_NOTICE;
  }

  // schemaVersion and eventId are optional transport metadata. Display does
  // not depend on either, including for messages from before versioning.
  return {
    title: data.title,
    body: data.body,
    url,
    tag: typeof data.tag === "string" ? data.tag : undefined,
    badge: Number.isInteger(data.badge) && data.badge >= 0 ? data.badge : undefined,
  };
}

async function setBadge(count) {
  try {
    if (count > 0) await self.navigator?.setAppBadge?.(count);
    else await self.navigator?.clearAppBadge?.();
  } catch {
    // Badging is optional. The notification is still shown.
  }
}

self.addEventListener("push", (event) => {
  const { title, body, url, tag, badge } = readNotice(event.data);
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/192.png",
      badge: "/icons/192.png",
      data: { url },
    }),
    setBadge(badge),
  ]));
});

function askPage(client, url) {
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), 1000);
    function finish(handled) {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(handled);
    }
    channel.port1.onmessage = (event) => {
      if (event.data === "handled") finish(true);
    };
    try {
      client.postMessage({ type: "flylabs:open", url }, [channel.port2]);
    } catch {
      // The window may have closed since matchAll.
      channel.port2.close();
      finish(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeInternalPath(event.notification.data?.url) ?? "/";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil((async () => {
    // Controlled windows are returned in most recently focused order.
    const windows = await self.clients.matchAll({ type: "window" });
    const matching = windows.find((client) => client.url === target);
    if (matching) {
      await matching.focus();
      matching.postMessage({ type: "flylabs:push-opened" });
      return;
    }

    const recent = windows[0];
    if (recent && await askPage(recent, url)) return recent.focus();
    const opened = new URL(target);
    opened.searchParams.set("_push_open", "1");
    return self.clients.openWindow(opened.href);
  })());
});
