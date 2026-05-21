/**
 * Refresh-loop wiring. Listens for online + visibility events and runs the
 * incremental refresh on an interval. Idempotent — multiple calls register
 * the same listener set once via a singleton flag.
 *
 * Owned by `app/scanner/layout.tsx` — call `startRefreshLoop()` in the
 * scanner layout effect; it returns a cleanup function.
 */

import { refreshGuestCache } from "./guest-cache";
import { loadDevice, loadSession } from "./session";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let started = false;
let intervalId: number | null = null;

function tryRefresh() {
  const device = loadDevice();
  const session = loadSession();
  if (!device || !session) return;
  void refreshGuestCache({
    orgSlug: device.org_slug,
    eventSlug: device.event_slug,
    sessionToken: session.session_token,
  }).catch((err) => {
    // Sentry breadcrumb only — not exception-worthy at this frequency.
    console.warn("refreshGuestCache failed", err);
  });
}

export function startRefreshLoop(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => tryRefresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") tryRefresh();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  intervalId = window.setInterval(tryRefresh, REFRESH_INTERVAL_MS);

  // Fire once immediately so the first refresh happens at start.
  tryRefresh();

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (intervalId) window.clearInterval(intervalId);
    intervalId = null;
  };
}
