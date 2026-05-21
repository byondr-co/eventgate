/**
 * Dexie schema for the scanner PWA.
 *
 * Three stores:
 *
 *   - guests          ← mirror of GuestSyncSerializer projection; keyed by
 *                       `entry_token`. The scan path looks up a token here
 *                       before deciding online vs offline behavior.
 *
 *   - mutation_queue  ← offline check-in writes. See QueuedMutation below
 *                       for the full schema. Indexed by `status` (for sync
 *                       loop) and `[status+next_attempt_at]` (for ordered
 *                       drain).
 *
 *   - meta            ← single-row key/value table for sync cursor + ETag.
 *
 * Schema version 1 is the initial Plan E schema. Bumps happen in future
 * plans; document each bump's upgrade path inline.
 *
 * ALL Dexie access goes through this module. Other scanner modules import
 * the `db` singleton; they never construct their own Dexie instance.
 */

import Dexie, { type Table } from "dexie";

export type CachedGuest = {
  id: string; // server uuid
  entry_token: string; // primary key — the QR payload
  full_name: string;
  email: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: string;
  info_status: string;
  updated_at: string; // iso8601
};

export type MutationStatus =
  | "pending"
  | "in_flight"
  | "completed"
  | "conflict"
  | "failed"
  | "escalated";

export type CheckinPayload = {
  token: string;
  gate: string;
  scanner_label: string;
  client_idempotency_key: string;
};

export type QueuedMutation = {
  id: string; // client uuid
  mutation_type: "checkin"; // extension point
  target_token: string; // denormalized
  client_idempotency_key: string;
  payload: CheckinPayload;
  status: MutationStatus;
  attempts: number;
  next_attempt_at: number; // epoch ms
  created_at: number; // epoch ms
  completed_at: number | null;
  last_error: string | null;
  server_response: unknown | null;
};

export type MetaRow = {
  key: string; // e.g. "sync_cursor", "etag"
  value: string;
};

class ScannerDB extends Dexie {
  guests!: Table<CachedGuest, string>; // PK: entry_token
  mutation_queue!: Table<QueuedMutation, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("eventgate_scanner_v1");
    this.version(1).stores({
      // Dexie "&" = primary key, indexes follow.
      guests: "&entry_token, id, entry_status, updated_at",
      mutation_queue: "&id, status, [status+next_attempt_at], target_token, created_at",
      meta: "&key",
    });
  }
}

export const db = new ScannerDB();
