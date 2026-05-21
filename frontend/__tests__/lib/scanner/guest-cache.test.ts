import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/scanner/db";
import {
  lookupGuestByToken,
  markCachedGuestCheckedIn,
  primeGuestCache,
} from "@/lib/scanner/guest-cache";

describe("guest cache priming + lookup", () => {
  beforeEach(async () => {
    await db.guests.clear();
    await db.meta.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("seeds the cache from the sync endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          guests: [
            {
              id: "g1",
              entry_token: "tok-1",
              full_name: "Alice",
              email: "a@example.com",
              guest_type: "pre_registered",
              entry_status: "registered_not_arrived",
              info_status: "info_completed",
              updated_at: "2026-05-21T10:00:00Z",
            },
          ],
          cursor: "2026-05-21T10:00:00Z",
        }),
        { status: 200, headers: { ETag: '"abcd"' } },
      ),
    );

    await primeGuestCache({
      orgSlug: "acme",
      eventSlug: "door",
      sessionToken: "sess",
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const all = await db.guests.toArray();
    expect(all).toHaveLength(1);
    const cursor = await db.meta.get("sync_cursor");
    expect(cursor?.value).toBe("2026-05-21T10:00:00Z");
    const etag = await db.meta.get("etag");
    expect(etag?.value).toBe('"abcd"');
  });

  it("lookupGuestByToken returns null when not cached", async () => {
    const hit = await lookupGuestByToken("never-seen");
    expect(hit).toBeNull();
  });

  it("lookupGuestByToken returns the cached row", async () => {
    await db.guests.put({
      id: "g1",
      entry_token: "tok-1",
      full_name: "Bob",
      email: "b@example.com",
      guest_type: "pre_registered",
      entry_status: "registered_not_arrived",
      info_status: "info_completed",
      updated_at: "2026-05-21T10:00:00Z",
    });
    const hit = await lookupGuestByToken("tok-1");
    expect(hit?.full_name).toBe("Bob");
  });

  it("markCachedGuestCheckedIn flips entry_status locally", async () => {
    await db.guests.put({
      id: "g1",
      entry_token: "tok-1",
      full_name: "Carol",
      email: "c@example.com",
      guest_type: "pre_registered",
      entry_status: "registered_not_arrived",
      info_status: "info_completed",
      updated_at: "2026-05-21T10:00:00Z",
    });
    await markCachedGuestCheckedIn("tok-1");
    const after = await lookupGuestByToken("tok-1");
    expect(after?.entry_status).toBe("checked_in");
  });
});
