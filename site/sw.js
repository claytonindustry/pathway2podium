/* P2P Sailing — service worker
   Two jobs: receive push notifications, and keep the app openable without a
   signal. Bump CACHE on every build so phones pick the new one up. */

const CACHE = "p2p-v18";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  /* Take over straight away rather than waiting for every tab to close —
     otherwise a phone can sit on an old build for days. */
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* Only ever touch our own files. Firebase traffic must go straight through,
     or the register would show stale people. */
  if (url.origin !== self.location.origin) return;

  /* Network first, so a published build reaches people immediately; the cache
     is only a fallback for when there is no signal in the yard. */
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === "basic") {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const title = d.title || "P2P Sailing";
  const opts = {
    body: d.body || "Something new needs your attention.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "p2p",
    renotify: true,
    data: { url: d.url || "./" }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.location.origin) === 0 && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
