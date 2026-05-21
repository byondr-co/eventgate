import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/scanner/db";
import {
  countByStatus,
  drainQueueOnce,
  enqueueCheckin,
  getPendingMutations,
  reapStaleInFlight,
  retryFailedMutation,
} from "@/lib/scanner/mutation-queue";

const NOW = 1716_000_000_000; // 2024-05-18T05:20:00Z — stable anchor

describe("mutation queue", () => {
  beforeEach(async () => {
    // Only fake Date — Dexie depends on real microtasks/timers to flush
    // transactions, so we leave setTimeout/queueMicrotask alone.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await db.mutation_queue.clear();
    await db.guests.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enqueues a pending checkin", async () => {
    const id = await enqueueCheckin({
      token: "tok-1",
      gate: "Gate 1",
      scanner_label: "Gate 1",
    });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.client_idempotency_key).toBeTruthy();
    expect(row?.payload.token).toBe("tok-1");
  });

  it("drainQueueOnce marks 200 success as completed", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          guest: {
            id: "g1",
            full_name: "Alice",
            entry_status: "checked_in",
            gate: "Gate 1",
            scanner: "Gate 1",
          },
        }),
        { status: 200 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    expect(await countByStatus("completed")).toBe(1);
  });

  it("drainQueueOnce marks 409 from a DIFFERENT device as conflict", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "duplicate",
          guest: {
            id: "g1",
            full_name: "Alice",
            entry_status: "checked_in",
            gate: "Gate 2",
            scanner: "Gate 2",
          },
          detail: "Already in state checked_in.",
        }),
        { status: 409 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    expect(await countByStatus("conflict")).toBe(1);
    expect(await countByStatus("completed")).toBe(0);
  });

  it("drainQueueOnce marks 409 from the SAME device as completed (self-replay)", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "duplicate",
          guest: {
            id: "g1",
            full_name: "Alice",
            entry_status: "checked_in",
            gate: "Gate 1",
            scanner: "Gate 1",
          },
        }),
        { status: 409 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    expect(await countByStatus("completed")).toBe(1);
    expect(await countByStatus("conflict")).toBe(0);
  });

  it("drainQueueOnce retries with exponential backoff on 5xx", async () => {
    const id = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(row?.next_attempt_at).toBe(NOW + 1000); // first backoff = 1s
  });

  it("after 8 failures, status flips to failed", async () => {
    const id = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    await db.mutation_queue.update(id, { attempts: 7 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("failed");
  });

  it("getPendingMutations returns rows whose next_attempt_at <= now", async () => {
    const a = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    const b = await enqueueCheckin({ token: "tok-2", gate: "Gate 1", scanner_label: "Gate 1" });
    await db.mutation_queue.update(b, { next_attempt_at: NOW + 60_000 });

    const due = await getPendingMutations();
    const ids = due.map((m) => m.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
  });
});

describe("reapStaleInFlight", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("resets in_flight rows older than 5 minutes to pending", async () => {
    const sixMinAgo = Date.now() - 6 * 60 * 1000;
    await db.mutation_queue.put({
      id: "stale",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G1", scanner_label: "S1", client_idempotency_key: "k" },
      status: "in_flight",
      attempts: 0,
      next_attempt_at: sixMinAgo,
      created_at: sixMinAgo,
      completed_at: null,
      last_error: null,
      server_response: null,
    });
    const n = await reapStaleInFlight();
    expect(n).toBe(1);
    const row = await db.mutation_queue.get("stale");
    expect(row?.status).toBe("pending");
  });

  it("leaves fresh in_flight rows alone", async () => {
    await db.mutation_queue.put({
      id: "fresh",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G1", scanner_label: "S1", client_idempotency_key: "k" },
      status: "in_flight",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: null,
      last_error: null,
      server_response: null,
    });
    const n = await reapStaleInFlight();
    expect(n).toBe(0);
    const row = await db.mutation_queue.get("fresh");
    expect(row?.status).toBe("in_flight");
  });
});

describe("enqueueCheckin dedupe", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("returns the existing row id if the same token is enqueued twice while pending", async () => {
    const id1 = await enqueueCheckin({ token: "same-token", gate: "G", scanner_label: "S" });
    const id2 = await enqueueCheckin({ token: "same-token", gate: "G", scanner_label: "S" });
    expect(id2).toBe(id1);
    const rows = await db.mutation_queue.where("target_token").equals("same-token").toArray();
    expect(rows).toHaveLength(1);
  });

  it("creates a new row if the prior one is completed", async () => {
    const id1 = await enqueueCheckin({ token: "done-token", gate: "G", scanner_label: "S" });
    await db.mutation_queue.update(id1, { status: "completed", completed_at: Date.now() });
    const id2 = await enqueueCheckin({ token: "done-token", gate: "G", scanner_label: "S" });
    expect(id2).not.toBe(id1);
  });

  it("does not dedupe when target_token differs", async () => {
    const id1 = await enqueueCheckin({ token: "a", gate: "G", scanner_label: "S" });
    const id2 = await enqueueCheckin({ token: "b", gate: "G", scanner_label: "S" });
    expect(id2).not.toBe(id1);
  });
});

describe("retryFailedMutation", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("resets a failed row to pending with attempts=0", async () => {
    await db.mutation_queue.put({
      id: "f1",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G", scanner_label: "S", client_idempotency_key: "k" },
      status: "failed",
      attempts: 8,
      next_attempt_at: Date.now() - 10000,
      created_at: Date.now() - 60000,
      completed_at: Date.now() - 1000,
      last_error: "token_not_recognised",
      server_response: null,
    });
    await retryFailedMutation("f1");
    const row = await db.mutation_queue.get("f1");
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.completed_at).toBeNull();
    expect(row?.last_error).toBeNull();
  });

  it("is a no-op on non-failed rows", async () => {
    await db.mutation_queue.put({
      id: "c1",
      mutation_type: "checkin",
      target_token: "t",
      client_idempotency_key: "k",
      payload: { token: "t", gate: "G", scanner_label: "S", client_idempotency_key: "k" },
      status: "completed",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: Date.now(),
      last_error: null,
      server_response: null,
    });
    await retryFailedMutation("c1");
    const row = await db.mutation_queue.get("c1");
    expect(row?.status).toBe("completed");
  });
});
