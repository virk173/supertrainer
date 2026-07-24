// Minimal offline shell for the portal (Phase 2.4). Deliberately narrow: it only
// pre-caches the offline page and serves it when a NAVIGATION fails. It never
// caches API, auth, or page responses — stale coaching data (or a cached
// authenticated page) would be worse than an offline notice.
const CACHE = "supertrainer-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
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
  const request = event.request;
  // Network-first for navigations only; everything else passes straight through.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ??
        new Response("You are offline.", {
          status: 503,
          headers: { "content-type": "text/plain" },
        })
      );
    }),
  );
});

// Phase 6.2 — push delivery. The worker (lib/push/worker.ts) sends a JSON payload
// { title, body, url, tag }; show it as the trainer-branded notification and, on
// click, focus an existing tab or deep-link to the relevant surface.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Your coach";
  const url = data.url || "/portal";
  const options = {
    body: data.body || "",
    icon: "/api/icon",
    badge: "/api/icon",
    tag: data.tag || "supertrainer",
    data: { url },
    // A "Log meal" quick action where the platform supports it.
    actions: data.url === "/portal/log" ? [{ action: "log", title: "Log meal" }] : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/portal";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse an open app tab if we have one.
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
