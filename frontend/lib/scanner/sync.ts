/**
 * Mutation-queue sync loop — drains queued check-ins on reconnect, on tab
 * visibility, and on a 30s heartbeat.
 *
 * Owned by `app/scanner/layout.tsx` — call `startSyncLoop()` once in the
 * scanner layout effect; it returns a cleanup function. The loop is a
 * singleton; multiple `startSyncLoop()` calls return no-op cleanups.
 */

import { drainQueueOnce } from "./mutation-queue";
import { loadDevice, loadSession } from "./session";

const SYNC_INTERVAL_MS = 30_000;
let started = false;
let intervalId: number | null = null;

async function tryDrain() {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  const device = loadDevice();
  const session = loadSession();
  if (!device || !session) return;
  if (device.role !== "scanner") return; // only pre-reg scanners have a queue
  try {
    await drainQueueOnce({
      sessionToken: session.session_token,
      deviceGate: device.label ?? "",
      deviceScanner: device.label ?? "",
    });
  } catch (err) {
    console.warn("drainQueueOnce failed", err);
  }
}

export function startSyncLoop(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => {
    void tryDrain();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") void tryDrain();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  intervalId = window.setInterval(() => void tryDrain(), SYNC_INTERVAL_MS);

  // Fire once immediately so any pending mutations drain on mount.
  void tryDrain();

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
  };
}
