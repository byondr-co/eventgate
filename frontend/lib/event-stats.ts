"use client";

import { useQuery } from "@tanstack/react-query";

import { createEtagCache } from "@/lib/etag-fetch";

export type EventStats = {
  checked_in: number;
  registered_not_arrived: number;
  manual_review: number;
  displayed: number;
  total_walkins: number;
  open_escalations: number;
  conflicts_recent_15min: number;
  as_of: string;
};

const statsEtagCache = createEtagCache();

const fetcher = (url: string): Promise<EventStats> =>
  statsEtagCache.fetchJSON<EventStats>(url);

export function useEventStats(orgSlug: string, eventSlug: string) {
  return useQuery<EventStats>({
    queryKey: ["event-stats", orgSlug, eventSlug],
    queryFn: () => fetcher(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/stats/`),
    enabled: !!orgSlug && !!eventSlug,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}
