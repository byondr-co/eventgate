/**
 * Guest cache — initial snapshot at unlock + helpers used by the offline
 * scan path.
 *
 * The cache lives in IndexedDB (see lib/scanner/db.ts) and is keyed by the
 * raw entry_token so the scan path can do a one-shot lookup before deciding
 * online vs offline behavior.
 *
 * This module owns only the *initial* snapshot + read helpers. Incremental
 * refresh lives in lib/scanner/refresh-loop.ts (Plan E Task 8). The
 * mutation queue lives in lib/scanner/mutation-queue.ts (Plan E Task 9).
 */

import { db, type CachedGuest } from "./db";

type PrimeArgs = {
  orgSlug: string;
  eventSlug: string;
  sessionToken: string;
};

/**
 * Pull the full guest list for an event into IndexedDB. Called once after
 * a successful PIN unlock so the device has data before going offline.
 */
export async function primeGuestCache(args: PrimeArgs): Promise<void> {
  const res = await fetch(`/api/v1/orgs/${args.orgSlug}/events/${args.eventSlug}/guests/sync/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${args.sessionToken}` },
  });
  if (!res.ok) {
    throw new Error(`primeGuestCache: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { guests: CachedGuest[]; cursor: string };
  await db.transaction("rw", db.guests, db.meta, async () => {
    if (body.guests.length > 0) {
      await db.guests.bulkPut(body.guests);
    }
    if (body.cursor) {
      await db.meta.put({ key: "sync_cursor", value: body.cursor });
    }
    const etag = res.headers.get("ETag");
    if (etag) {
      await db.meta.put({ key: "etag", value: etag });
    }
  });
}

/**
 * Look up a guest by their raw entry_token. Returns null if not cached.
 * Called from the scan page on every detection.
 */
export async function lookupGuestByToken(token: string): Promise<CachedGuest | null> {
  const row = await db.guests.where("entry_token").equals(token).first();
  return row ?? null;
}

/**
 * Mutate the locally-cached guest's entry_status so the next scan of the
 * same QR doesn't optimistically queue a second check-in. Called from
 * mutation-queue.ts (Plan E Task 9) when an offline scan is enqueued.
 */
export async function markCachedGuestCheckedIn(token: string): Promise<void> {
  await db.guests
    .where("entry_token")
    .equals(token)
    .modify((g) => {
      g.entry_status = "checked_in";
    });
}

/**
 * Incremental refresh. Sends the stored cursor as ?since and the stored
 * ETag as If-None-Match. Updates the cache + cursor + etag on 200; no-op
 * on 304.
 *
 * Called from refresh-loop.ts on (a) the `online` event, (b) `visibilitychange`
 * to "visible", (c) a 5-minute interval while the scanner shell is mounted.
 */
export async function refreshGuestCache(args: PrimeArgs): Promise<void> {
  const cursor = await db.meta.get("sync_cursor");
  const etag = await db.meta.get("etag");
  const path = `/api/v1/orgs/${args.orgSlug}/events/${args.eventSlug}/guests/sync/`;
  const params = new URLSearchParams();
  if (cursor?.value) params.set("since", cursor.value);
  const url = params.size > 0 ? `${path}?${params.toString()}` : path;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.sessionToken}`,
  };
  if (etag?.value) headers["If-None-Match"] = etag.value;

  const res = await fetch(url, { method: "GET", headers });

  if (res.status === 304) {
    return; // cache is current
  }
  if (!res.ok) {
    throw new Error(`refreshGuestCache: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { guests: CachedGuest[]; cursor: string };
  await db.transaction("rw", db.guests, db.meta, async () => {
    if (body.guests.length > 0) {
      await db.guests.bulkPut(body.guests);
    }
    if (body.cursor) {
      await db.meta.put({ key: "sync_cursor", value: body.cursor });
    }
    const newEtag = res.headers.get("ETag");
    if (newEtag) {
      await db.meta.put({ key: "etag", value: newEtag });
    }
  });
}
