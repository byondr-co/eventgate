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
 */

const KEYS = {
  device: "eventgate.scanner.device",
  session: "eventgate.scanner.session",
} as const;

export type ScannerRole = "scanner" | "walkin_display" | "helpdesk";

export type ScannerIdentity = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  org_slug: string;
  label: string;
  role: ScannerRole;
};

export type ScannerSession = {
  session_token: string;
  expires_at: string;
};

const isBrowser = () => typeof window !== "undefined";

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
}

export function clearDevice() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEYS.device);
  window.localStorage.removeItem(KEYS.session);
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
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEYS.session);
}
