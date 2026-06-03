/** Client-side walk-in re-scan guard + self-issued device id.
 *
 *  This is a deterrent, NOT enforcement: localStorage is clearable and per
 *  browser profile. It stops casual repeat-claims (one phone draining the
 *  walk-in cap by scanning the auto-advancing QR), and the device id gives the
 *  backend an audit trail of repeat attempts.
 */

const CLAIM_PREFIX = "eventgate.walkin.claimed:";
const DEVICE_ID_KEY = "eventgate.device_id";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // Safari private mode etc.
  }
}

export function claimedKey(orgSlug: string, eventSlug: string): string {
  return `${CLAIM_PREFIX}${orgSlug}/${eventSlug}`;
}

export type StoredClaim = { token: string; claimedAt: number; infoCompleted: boolean };

/** The walk-in token this device already claimed for the event, if any. */
export function readClaim(orgSlug: string, eventSlug: string): StoredClaim | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(claimedKey(orgSlug, eventSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredClaim>;
    return typeof parsed?.token === "string"
      ? {
          token: parsed.token,
          claimedAt: Number(parsed.claimedAt) || 0,
          infoCompleted: parsed.infoCompleted === true,
        }
      : null;
  } catch {
    return null;
  }
}

export function writeClaim(orgSlug: string, eventSlug: string, token: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    // Preserve the info-completed flag if re-writing the same token (idempotent re-scan).
    const prior = readClaim(orgSlug, eventSlug);
    const infoCompleted = prior?.token === token ? prior.infoCompleted : false;
    const value: StoredClaim = { token, claimedAt: Date.now(), infoCompleted };
    ls.setItem(claimedKey(orgSlug, eventSlug), JSON.stringify(value));
  } catch {
    // ignore quota / private-mode write failures
  }
}

/** Record that this device finished the inside-hall info form for `token`. */
export function markInfoCompleted(orgSlug: string, eventSlug: string, token: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    const prior = readClaim(orgSlug, eventSlug);
    const value: StoredClaim = {
      token,
      claimedAt: prior?.token === token ? prior.claimedAt : Date.now(),
      infoCompleted: true,
    };
    ls.setItem(claimedKey(orgSlug, eventSlug), JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Stable, self-issued id for this browser. Created lazily, persisted. */
export function getDeviceId(): string {
  const ls = storage();
  if (!ls) return "";
  try {
    let id = ls.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      ls.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
