"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type AuditResult = "success" | "warning" | "error";

export type AuditRow = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string;
  action: string;
  result: AuditResult;
  previous_status: string;
  new_status: string;
  gate: string;
  scanner: string;
  entry_token: string;
  details_json: Record<string, unknown>;
};

export type AuditListResponse = {
  count: number;
  next: string | null;
  results: AuditRow[];
};

/** List audit events for an event, optionally filtered by action prefix.
 *  Pass prefix === "all" (or "") to omit the filter. Auto-refreshes every 10s. */
export function useAuditEvents(orgSlug: string, eventSlug: string, prefix: string) {
  const qs = !prefix || prefix === "all" ? "" : `?action_prefix=${encodeURIComponent(prefix)}`;
  return useQuery({
    queryKey: ["audit", orgSlug, eventSlug, prefix],
    queryFn: () =>
      apiFetch<AuditListResponse>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/audit/${qs}`),
    enabled: !!orgSlug && !!eventSlug,
    refetchInterval: 10_000,
  });
}
