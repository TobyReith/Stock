// Stock PWA service worker.
//
// Two responsibilities:
//   1. Network-first navigation cache (Phase 0) — offline fallback to "/".
//   2. Web Push reminders (Phase 2) — render a notification with the
//      payload sent by the cron endpoint, deep-link to "/" on click.

const CACHE = "stock-v2";
const OFFLINE_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r ?? caches.match("/"))),
    );
  }
});

/* --------------------------------------------------------------------- *
 * Push: called when the browser receives a push from our cron endpoint. *
 * The payload is the JSON shape from `src/lib/push/web-push.ts`:        *
 *   { title, body, url, tag? }                                          *
 * --------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  // Ignore pushes without a data payload — we always send one, so this
  // would only happen if a push service sends a keep-alive ping.
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Malformed payload — show a generic fallback rather than nothing.
    payload = { title: "Stock", body: "Ein Artikel wird bald fällig." };
  }

  const options = {
    body: payload.body,
    // `tag` lets a new push with the same tag replace the previous one
    // rather than piling up — critical for "daily reminder" UX.
    tag: payload.tag || "stock-reminder",
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      // Prefer focusing an existing tab over opening a new one — avoids
      // a fresh SPA hydration if the app is already open.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const win of windows) {
        try {
          const url = new URL(win.url);
          // Same origin + open tab → focus and navigate inline.
          if (url.origin === self.location.origin) {
            await win.focus();
            if ("navigate" in win) await win.navigate(targetUrl);
            return;
          }
        } catch {
          // Ignore parse errors, fall through to openWindow.
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
