/**
 * Mutation queue — offline check-in writes.
 *
 * Single writer to db.mutation_queue. Status lifecycle:
 *
 *   pending  ──flush──▶  in_flight  ──200──▶  completed
 *                                    ──409+same gate──▶  completed (self-replay)
 *                                    ──409+different gate──▶  conflict
 *                                    ──404──▶  failed
 *                                    ──5xx / network──▶  pending (with backoff)
 *                                                          ── attempts >= 8 ─▶ failed
 *
 *   conflict ──"Send to help desk"──▶  escalated   (handled in escalations.ts)
 *
 * After 24h in completed/escalated, rows are purged by the GC sweep.
 *
 * Backoff schedule (attempts → ms): 1: 1000, 2: 2000, 3: 4000, 4: 8000,
 *                                   5: 16000, 6: 32000, 7: 60000, 8: 60000
 *
 * The client_idempotency_key is generated at ENQUEUE time, not at flush, so
 * retries use the same key and the server's Redis idempotency cache
 * short-circuits the second call into the cached success payload.
 */

import * as Sentry from "@sentry/nextjs";

import { db, type CheckinPayload, type MutationStatus, type QueuedMutation } from "./db";
import { markCachedGuestCheckedIn } from "./guest-cache";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000];
const MAX_ATTEMPTS = BACKOFF_MS.length;
const REAP_THRESHOLD_MS = 5 * 60 * 1000;
const GC_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Reset `in_flight` rows that haven't moved in >5 minutes back to `pending`.
 * Runs once at startup. If the PWA died between `set in_flight` and the
 * server's response, the row would otherwise be invisible to
 * `getPendingMutations()` and stuck forever.
 *
 * Uses `created_at` (enqueue time) as the staleness check — `drainQueueOnce`
 * doesn't currently update `next_attempt_at` on the pending→in_flight
 * transition, so enqueue time is a sufficient lower bound for "how old is
 * this in_flight."
 */
export async function reapStaleInFlight(): Promise<number> {
  const cutoff = Date.now() - REAP_THRESHOLD_MS;
  const stale = await db.mutation_queue
    .where("status")
    .equals("in_flight")
    .filter((r) => r.created_at < cutoff)
    .toArray();
  for (const row of stale) {
    await db.mutation_queue.update(row.id, {
      status: "pending",
      next_attempt_at: Date.now(),
    });
  }
  return stale.length;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type EnqueueInput = {
  token: string;
  gate: string;
  scanner_label: string;
};

export async function enqueueCheckin(input: EnqueueInput): Promise<string> {
  const id = uuid();
  const key = uuid();
  const payload: CheckinPayload = {
    token: input.token,
    gate: input.gate,
    scanner_label: input.scanner_label,
    client_idempotency_key: key,
  };
  const now = Date.now();
  const row: QueuedMutation = {
    id,
    mutation_type: "checkin",
    target_token: input.token,
    client_idempotency_key: key,
    payload,
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    created_at: now,
    completed_at: null,
    last_error: null,
    server_response: null,
  };
  await db.mutation_queue.put(row);

  // Optimistically flip the cached guest's entry_status so the next scan of
  // the same QR shows a "Duplicate" card locally instead of re-queueing.
  await markCachedGuestCheckedIn(input.token).catch(() => {});

  return id;
}

export async function countByStatus(status: MutationStatus): Promise<number> {
  return db.mutation_queue.where("status").equals(status).count();
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const now = Date.now();
  return db.mutation_queue
    .where("[status+next_attempt_at]")
    .between(["pending", -Infinity], ["pending", now], true, true)
    .toArray();
}

export async function getConflictMutations(): Promise<QueuedMutation[]> {
  return db.mutation_queue.where("status").equals("conflict").toArray();
}

type DrainArgs = {
  sessionToken: string;
  deviceGate: string;
  deviceScanner: string;
};

export async function drainQueueOnce(args: DrainArgs): Promise<{
  ok: number;
  conflicts: number;
  failed: number;
}> {
  await gcCompleted();
  const due = (await getPendingMutations()).sort((a, b) => a.created_at - b.created_at);
  let ok = 0;
  let conflicts = 0;
  let failed = 0;

  for (const row of due) {
    await db.mutation_queue.update(row.id, { status: "in_flight" });
    let res: Response;
    try {
      res = await fetch("/api/v1/checkins/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.sessionToken}`,
        },
        body: JSON.stringify(row.payload),
      });
    } catch (err) {
      await scheduleRetry(row, (err as Error).message);
      continue;
    }

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      // empty body on 5xx is fine
    }

    if (res.status === 200) {
      await db.mutation_queue.update(row.id, {
        status: "completed",
        completed_at: Date.now(),
        server_response: body,
      });
      ok += 1;
    } else if (res.status === 409 && body?.guest) {
      const g = body.guest as { gate?: string; scanner?: string };
      const sameGate = (g.gate ?? "") === args.deviceGate;
      const sameScanner = (g.scanner ?? "") === args.deviceScanner;
      if (sameGate && sameScanner) {
        await db.mutation_queue.update(row.id, {
          status: "completed",
          completed_at: Date.now(),
          server_response: body,
        });
        ok += 1;
      } else {
        await db.mutation_queue.update(row.id, {
          status: "conflict",
          completed_at: Date.now(),
          server_response: body,
        });
        conflicts += 1;
      }
    } else if (res.status === 404) {
      await db.mutation_queue.update(row.id, {
        status: "failed",
        completed_at: Date.now(),
        last_error: "token_not_recognised",
        server_response: body,
      });
      failed += 1;
    } else {
      await scheduleRetry(row, `${res.status} ${res.statusText}`);
    }
  }

  return { ok, conflicts, failed };
}

async function scheduleRetry(row: QueuedMutation, errMsg: string): Promise<void> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db.mutation_queue.update(row.id, {
      status: "failed",
      attempts,
      completed_at: Date.now(),
      last_error: errMsg,
    });
    try {
      Sentry.captureException(new Error("mutation_queue_exhausted"), {
        extra: { row_id: row.id, target_token: row.target_token, last_error: errMsg },
      });
    } catch {
      // Sentry not configured — ignore.
    }
    return;
  }
  const delay = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  await db.mutation_queue.update(row.id, {
    status: "pending",
    attempts,
    next_attempt_at: Date.now() + delay,
    last_error: errMsg,
  });
}

async function gcCompleted(): Promise<void> {
  const cutoff = Date.now() - GC_TTL_MS;
  await db.mutation_queue
    .where("status")
    .anyOf(["completed", "escalated"])
    .filter((r) => r.completed_at !== null && r.completed_at < cutoff)
    .delete();
}
