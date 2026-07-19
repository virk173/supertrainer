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

// Phase 6 adds the push/notificationclick handlers that deliver coach messages;
// the subscription captured in Phase 2.4 is what makes that possible.
