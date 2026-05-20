// Eventgate scanner — minimal service worker (Plan D).
// Scope: caches static chunks only so the shell loads after a reload while
// offline. Does NOT cache API responses or guest data. Plan E replaces this
// with Workbox + IndexedDB once offline scan sync lands.

const STATIC_CACHE = "eventgate-static-v1";
const PRECACHE_URLS = ["/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE_URLS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  // Only intercept GETs. Everything else (POST checkins, etc.) must hit the
  // network — no offline mutation queue in Plan D.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API calls — they're routed through Vercel rewrite to Django.
  if (url.pathname.startsWith("/api/")) return;

  evt.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((r) => r || new Response("offline", { status: 503 })),
    ),
  );
});
