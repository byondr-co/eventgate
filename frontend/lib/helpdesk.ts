"use client";

import useSWR from "swr";

export type AuditEventCompact = {
  id: string;
  occurred_at: string;
  action: string;
  result: string;
  entry_token: string;
  gate: string;
  scanner: string;
  actor_type: string;
  actor_id: string;
  details_json: Record<string, unknown>;
};

export type Ticket = {
  id: number;
  audit_event: AuditEventCompact;
  claim_status: "open" | "claimed" | "resolved";
  assigned_to_email: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  resolution_action: "" | "approve_checkin" | "resolved_with_note" | "void";
  resolution_notes: string;
  created_at: string;
  updated_at: string;
};

type ListResponse = { results: Ticket[]; count: number };

const fetcher = async (url: string): Promise<ListResponse> => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as ListResponse;
};

export function useTickets(orgSlug: string, eventSlug: string, status: string) {
  const qs = status === "all" ? "" : `?status=${status}`;
  return useSWR<ListResponse>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${qs}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true },
  );
}

export async function claimTicket(orgSlug: string, eventSlug: string, id: number): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/claim/`,
    { method: "POST", credentials: "include" },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}

export async function releaseTicket(
  orgSlug: string,
  eventSlug: string,
  id: number,
): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/release/`,
    { method: "POST", credentials: "include" },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}

export async function resolveTicket(
  orgSlug: string,
  eventSlug: string,
  id: number,
  body: {
    action: "approve_checkin" | "resolved_with_note" | "void";
    notes: string;
  },
): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/resolve/`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}
