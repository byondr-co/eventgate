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
