"use client";

import { db, type QueuedMutation } from "./db";
import { loadSession } from "./session";

export async function escalateMutation(row: QueuedMutation): Promise<void> {
  const s = loadSession();
  if (!s) throw new Error("session_expired");

  const conflictPayload = row.server_response as {
    guest?: { gate?: string; scanner?: string };
  } | null;
  const res = await fetch("/api/v1/scanner/escalations/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.session_token}`,
    },
    body: JSON.stringify({
      token: row.target_token,
      reason: "scanner_offline_conflict",
      original_payload: row.payload,
      conflict_payload: {
        gate: conflictPayload?.guest?.gate ?? null,
        scanner: conflictPayload?.guest?.scanner ?? null,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`escalate: ${res.status} ${res.statusText}`);
  }
  await db.mutation_queue.update(row.id, {
    status: "escalated",
    completed_at: Date.now(),
  });
}
