// WeGrocery service worker configuration.
importScripts("/sw-core.js");

self.installFlylabsWorker({
  offlineVersion: 1,
  fallback: { title: "WeGrocery", body: "You have a new notification", url: "/" },
  icon: "/icons/192.png",
  badgeIcon: "/icons/192.png",
  // The core already restricts navigation to safe paths on this origin.
  allowPath: () => true,
  openedParam: "_push_open",
});
