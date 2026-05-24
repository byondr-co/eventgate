/**
 * Gatethres scanner — Workbox-composed service worker (Plan E).
 *
 * Two jobs:
 *
 *   1. Cache the PWA shell (`/manifest.webmanifest`, `/favicon.ico`, `/icons/*`)
 *      cache-first so install/icon paths never hit the network.
 *
 *   2. Cache Next.js static chunks via NetworkFirst — fresh on every online
 *      load, falls back to cache when offline.
 *
 * Notably absent: NO `precacheAndRoute(...)`. Vercel rebuilds the Next.js
 * chunks with new content-hash filenames on every deploy, but Vercel does
 * NOT re-run `scripts/build-sw.mjs` (Vercel's framework detection runs
 * `next build` only, not the `pnpm build` chain in package.json). So
 * baking chunk URLs into a precache manifest would point at stale hashes
 * after each deploy and Workbox would throw `bad-precaching-response` on
 * SW install. Runtime caching via NetworkFirst sidesteps this entirely:
 * chunks cache lazily on first online fetch (which is exactly when the
 * scanner pairs + primes its guest cache), then serve from cache when
 * offline. Trade-off vs. precache: a user who installs the PWA, never
 * navigates while online, and immediately goes offline would see a
 * miss — not a real scenario for door-day check-in.
 *
 * Also intentionally absent: NO fetch handler for `/api/*`. The mutation
 * queue lives in the page context (Dexie + lib/scanner/sync.ts). The SW
 * does NOT intercept POSTs, because we need bodied responses for conflict
 * detection and workbox-background-sync's BackgroundSyncPlugin replays
 * headers-only.
 *
 * Compiled by scripts/build-sw.mjs to public/sw.js. Editing public/sw.js
 * directly is wasted effort — the script overwrites it on every build.
 */

/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

skipWaiting();
clientsClaim();

// PWA icons + manifest — cache-first, refresh in background.
registerRoute(
  ({ url }) =>
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icons/"),
  new CacheFirst({ cacheName: "gatethres-shell-v2" }),
);

// Next.js static chunks — network-first with a short cache fallback.
registerRoute(
  ({ url }) => url.pathname.startsWith("/_next/static/"),
  new NetworkFirst({
    cacheName: "gatethres-next-static-v2",
    networkTimeoutSeconds: 3,
  }),
);

// IMPORTANT: do NOT register a fetch handler for /api/*. The mutation queue
// lives in the page context. See module docstring above.
