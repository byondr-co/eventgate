/**
 * Scanner identity + session-token storage.
 *
 * Two artifacts live in localStorage:
 *   - `eventgate.scanner.device` — long-lived ScannerIdentity (device_token,
 *     event/org/role metadata). Survives PIN re-unlocks. Cleared on revoke.
 *   - `eventgate.scanner.session` — short-lived ScannerSession (8h TTL).
 *     Cleared on expiry or 401.
 *
 * Plan D scope: synchronous localStorage access (online-only). Plan E will
 * move to IndexedDB so offline sync can persist mutations alongside identity.
 *
 * `useDeviceIdentity()` uses useSyncExternalStore so components can react to
 * device changes without setting state inside an effect (which trips the
 * react-hooks/set-state-in-effect lint rule).
 */

import { useSyncExternalStore } from "react";

const KEYS = {
  device: "eventgate.scanner.device",
  session: "eventgate.scanner.session",
} as const;

const SAME_TAB_EVENT = "eventgate.scanner.changed";

export type ScannerRole = "scanner" | "walkin_display" | "helpdesk";

export type ScannerIdentity = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  /** Human event name. Optional: sessions enrolled before Plan M lack it; consumers fall back to event_slug. */
  event_name?: string;
  org_slug: string;
  label: string;
  role: ScannerRole;
};

export type ScannerSession = {
  session_token: string;
  expires_at: string;
};

const isBrowser = () => typeof window !== "undefined";

function emitChange() {
  if (isBrowser()) window.dispatchEvent(new Event(SAME_TAB_EVENT));
}

export function loadDevice(): ScannerIdentity | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(KEYS.device);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScannerIdentity;
  } catch {
    return null;
  }
}

export function saveDevice(id: ScannerIdentity) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEYS.device, JSON.stringify(id));
  emitChange();
}

export function clearDevice() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEYS.device);
  window.localStorage.removeItem(KEYS.session);
  emitChange();
}

export function loadSession(): ScannerSession | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(KEYS.session);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ScannerSession;
    if (new Date(s.expires_at).getTime() <= Date.now()) {
      window.localStorage.removeItem(KEYS.session);
      return null;
    }
    return s;
  } catch {
    window.localStorage.removeItem(KEYS.session);
    return null;
  }
}

export function saveSession(s: ScannerSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEYS.session, JSON.stringify(s));
  emitChange();
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEYS.session);
  emitChange();
}

// ---- React subscription ----

// useSyncExternalStore demands stable references from getSnapshot when the
// underlying value hasn't changed. We memoize on the raw localStorage string.
let _cachedRaw: string | null | undefined;
let _cachedDevice: ScannerIdentity | null = null;

function deviceSnapshot(): ScannerIdentity | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(KEYS.device);
  if (raw !== _cachedRaw) {
    _cachedRaw = raw;
    try {
      _cachedDevice = raw ? (JSON.parse(raw) as ScannerIdentity) : null;
    } catch {
      _cachedDevice = null;
    }
  }
  return _cachedDevice;
}

function deviceServerSnapshot(): ScannerIdentity | null {
  return null;
}

function subscribeDevice(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener("storage", cb); // cross-tab
  window.addEventListener(SAME_TAB_EVENT, cb); // same-tab (our own writes)
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SAME_TAB_EVENT, cb);
  };
}

export function useDeviceIdentity(): ScannerIdentity | null {
  return useSyncExternalStore(subscribeDevice, deviceSnapshot, deviceServerSnapshot);
}
