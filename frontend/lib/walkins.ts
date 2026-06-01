"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { getDeviceId } from "./walkin-device";

/** The public walk-in endpoints are anonymous (no JWT cookie, no Authorization
 *  header). Plain `fetch` is the right primitive; no apiFetch wrapper. */

export type ClaimResponse = {
  guest_id: string;
  event_slug: string;
  org_slug: string;
  info_form_url: string;
};

/** POST /api/v1/e/<org>/<event>/claim/<token>/ — idempotent.
 *
 *  Modelled as useQuery instead of useMutation because the endpoint should
 *  fire on page mount and is safe to retry (server returns the same payload
 *  for an already-claimed walk-in).
 */
export function useClaim(
  orgSlug: string,
  eventSlug: string,
  token: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["walkin-claim", orgSlug, eventSlug, token],
    queryFn: async (): Promise<ClaimResponse> => {
      const res = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/claim/${token}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: getDeviceId() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    enabled: (options.enabled ?? true) && !!orgSlug && !!eventSlug && !!token,
    retry: 1,
  });
}

export type InfoResponse = {
  guest_id: string;
  info_status: string;
};

export function useCompleteInfo(orgSlug: string, eventSlug: string, token: string) {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>): Promise<InfoResponse> => {
      const res = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/info/${token}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
  });
}
