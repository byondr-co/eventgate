/**
 * Eventgate scanner — Workbox-composed service worker (Plan E).
 *
 * Three jobs:
 *
 *   1. Cache the Next.js static asset bundle so the scanner shell can boot
 *      with no network.
 *
 *   2. Serve `/manifest.webmanifest`, `/sw.js`, `/icons/*`, and `/favicon.ico`
 *      from cache-first so the PWA install / icon paths never hit the network.
 *
 *   3. Stay out of the way of `/api/*`. The mutation queue lives in the page
 *      context (Dexie + lib/scanner/sync.ts) — the SW does NOT intercept
 *      POSTs, because we need bodied responses for conflict detection and
 *      workbox-background-sync's BackgroundSyncPlugin replays headers-only.
 *
 * Compiled by scripts/build-sw.mjs to public/sw.js. Editing public/sw.js
 * directly is wasted effort — the script overwrites it on every build.
 */

import { clientsClaim, skipWaiting } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

skipWaiting();
clientsClaim();

// __WB_MANIFEST is replaced at build time by scripts/build-sw.mjs.
precacheAndRoute(self.__WB_MANIFEST || []);

// PWA icons + manifest — cache-first, refresh in background.
registerRoute(
  ({ url }) =>
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icons/"),
  new CacheFirst({ cacheName: "eventgate-shell-v1" }),
);

// Next.js static chunks — network-first with a short cache fallback.
registerRoute(
  ({ url }) => url.pathname.startsWith("/_next/static/"),
  new NetworkFirst({
    cacheName: "eventgate-next-static-v1",
    networkTimeoutSeconds: 3,
  }),
);

// IMPORTANT: do NOT register a fetch handler for /api/*. The mutation queue
// lives in the page context. See module docstring above.
