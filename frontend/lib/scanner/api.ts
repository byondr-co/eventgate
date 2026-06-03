/**
 * Scanner-side fetch helpers.
 *
 * Unlike the organizer dashboard, the scanner never uses JWT cookies — it
 * authenticates with device + session tokens carried in the Authorization
 * header. Plain `fetch` (no credentials) is the right primitive.
 */

import { loadDevice, loadSession } from "./session";

export type EnrollResponse = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  event_name: string;
  org_slug: string;
  label: string;
  role: "scanner" | "walkin_display" | "helpdesk";
};

export type UnlockResponse = {
  session_token: string;
  expires_at: string;
  device_id: string;
  event_id: string;
  label: string;
  role: "scanner" | "walkin_display" | "helpdesk";
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function postEnroll(enrollmentCode: string): Promise<EnrollResponse> {
  const res = await fetch("/api/v1/devices/enroll/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enrollment_code: enrollmentCode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function postUnlock(deviceToken: string, pin: string): Promise<UnlockResponse> {
  const res = await fetch("/api/v1/devices/unlock/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Device ${deviceToken}`,
    },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Convenience: load device identity + session, build the Bearer header. */
export function sessionAuthHeader(): string | null {
  const s = loadSession();
  if (!s) return null;
  return `Bearer ${s.session_token}`;
}

/** Convenience: load device identity, build the Device header. */
export function deviceAuthHeader(): string | null {
  const id = loadDevice();
  if (!id) return null;
  return `Device ${id.device_token}`;
}

// ---- Check-in ----

export type GuestSummary = {
  id: string;
  full_name: string;
  email: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: string;
  info_status: string;
  gate: string;
  scanner: string;
  checked_in_at: string | null;
};

export type CheckinOutcome =
  | { kind: "success"; guest: GuestSummary }
  | { kind: "duplicate"; guest: GuestSummary; detail: string }
  | { kind: "invalid"; detail: string }
  | { kind: "session_expired" }
  | { kind: "error"; detail: string };

export type CheckinRequest = {
  token: string;
  gate: string;
  scanner_label: string;
  client_idempotency_key: string;
};

export async function postCheckin(body: CheckinRequest): Promise<CheckinOutcome> {
  const session = loadSession();
  if (!session) return { kind: "session_expired" };

  let res: Response;
  try {
    res = await fetch("/api/v1/checkins/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { kind: "error", detail: (e as Error).message };
  }

  if (res.status === 401) return { kind: "session_expired" };

  const data = (await res.json().catch(() => ({}))) as Partial<GuestSummary> & {
    status?: string;
    detail?: string;
    guest?: GuestSummary;
  };

  if (res.status === 200 && data.guest) {
    return { kind: "success", guest: data.guest };
  }
  if (res.status === 409 && data.guest) {
    return { kind: "duplicate", guest: data.guest, detail: data.detail ?? "Already checked in." };
  }
  if (res.status === 404) {
    return { kind: "invalid", detail: data.detail ?? "Token not recognised for this event." };
  }
  return { kind: "error", detail: data.detail ?? `${res.status} ${res.statusText}` };
}

// ---- Walk-in display ----

export type WalkinDisplayReady = {
  status?: "ready";
  guest_id: string;
  entry_token: string;
  claim_url: string;
  walkin_count: number;
  walkin_capacity: number;
};

export type WalkinDisplayFull = {
  status: "full";
  walkin_count: number;
  walkin_capacity: number;
};

export type WalkinDisplayResponse = WalkinDisplayReady | WalkinDisplayFull;

export type WalkinDisplayOutcome =
  | { kind: "ready"; data: WalkinDisplayReady }
  | { kind: "full"; data: WalkinDisplayFull }
  | { kind: "session_expired" }
  | { kind: "error"; detail: string };

export async function postWalkinDisplayNext(input: {
  gate: string;
  scanner_label: string;
}): Promise<WalkinDisplayOutcome> {
  const session = loadSession();
  if (!session) return { kind: "session_expired" };

  let res: Response;
  try {
    res = await fetch("/api/v1/walkins/displays/next/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session_token}`,
      },
      body: JSON.stringify(input),
    });
  } catch (e) {
    return { kind: "error", detail: (e as Error).message };
  }

  if (res.status === 401) return { kind: "session_expired" };
  const data = (await res.json().catch(() => ({}))) as WalkinDisplayResponse | { detail?: string };

  if (res.status === 200 && "status" in data && data.status === "full") {
    return { kind: "full", data };
  }
  if (res.status === 200 && "entry_token" in data) {
    return { kind: "ready", data };
  }
  return {
    kind: "error",
    detail: (data as { detail?: string }).detail ?? `${res.status} ${res.statusText}`,
  };
}
