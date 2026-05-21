import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, type CachedGuest, type QueuedMutation } from "@/lib/scanner/db";

describe("scanner Dexie schema", () => {
  beforeEach(async () => {
    await db.guests.clear();
    await db.mutation_queue.clear();
    await db.meta.clear();
  });

  afterEach(async () => {
    await db.guests.clear();
    await db.mutation_queue.clear();
    await db.meta.clear();
  });

  it("stores and retrieves a guest by entry_token", async () => {
    const g: CachedGuest = {
      id: "00000000-0000-0000-0000-000000000001",
      entry_token: "raw-token-abc",
      full_name: "Alice",
      email: "alice@example.com",
      guest_type: "pre_registered",
      entry_status: "registered_not_arrived",
      info_status: "info_completed",
      updated_at: "2026-05-21T00:00:00Z",
    };
    await db.guests.put(g);
    const out = await db.guests.where("entry_token").equals("raw-token-abc").first();
    expect(out?.full_name).toBe("Alice");
  });

  it("enqueues + retrieves a mutation by status", async () => {
    const m: QueuedMutation = {
      id: "mut-1",
      mutation_type: "checkin",
      target_token: "raw-token-abc",
      client_idempotency_key: "idem-1",
      payload: {
        token: "raw-token-abc",
        gate: "Gate 1",
        scanner_label: "Gate 1",
        client_idempotency_key: "idem-1",
      },
      status: "pending",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: null,
      last_error: null,
      server_response: null,
    };
    await db.mutation_queue.put(m);
    const pending = await db.mutation_queue.where("status").equals("pending").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("mut-1");
  });

  it("meta table holds a single sync-cursor row", async () => {
    await db.meta.put({ key: "sync_cursor", value: "2026-05-21T00:00:00Z" });
    const cursor = await db.meta.get("sync_cursor");
    expect(cursor?.value).toBe("2026-05-21T00:00:00Z");
  });
});
