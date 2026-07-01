"use client";

import { useQuery } from "@tanstack/react-query";

import { createEtagCache } from "@/lib/etag-fetch";

export type ThroughputWindow = {
  checkins: number;
  per_minute: number;
  window_start: string | null;
  window_end: string | null;
};

export type GateUtilizationRow = {
  gate: string;
  scanner: string;
  checkins: number;
  duplicates: number;
  conflicts: number;
  share: number;
  per_minute: number;
};

export type TrendPoint = {
  bucket_start: string | null;
  checkins: number;
};

export type RecentActivity = {
  id: string;
  occurred_at: string | null;
  action: string;
  result: "success" | "warning" | "error";
  gate: string;
  scanner: string;
  guest_id: string | null;
  guest_label: string;
};

export type EventAnalytics = {
  throughput_5m: ThroughputWindow;
  peak_5m: ThroughputWindow;
  gate_utilization_15m: GateUtilizationRow[];
  trend_60m: TrendPoint[];
};

export type EventStats = {
  checked_in: number;
  registered_not_arrived: number;
  manual_review: number;
  displayed: number;
  total_walkins: number;
  open_escalations: number;
  conflicts_recent_15min: number;
  analytics?: EventAnalytics;
  recent_activity?: RecentActivity[];
  as_of?: string;
};

export type EventLiveSnapshot = Omit<EventStats, "analytics" | "recent_activity"> &
  Required<Pick<EventStats, "analytics" | "recent_activity">>;

type EventStatsOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

const statsEtagCache = createEtagCache();

const fetcher = (url: string): Promise<EventStats> => statsEtagCache.fetchJSON<EventStats>(url);

export function useEventStats(orgSlug: string, eventSlug: string, options: EventStatsOptions = {}) {
  return useQuery<EventStats>({
    queryKey: ["event-stats", orgSlug, eventSlug],
    queryFn: () => fetcher(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/stats/`),
    enabled: (options.enabled ?? true) && !!orgSlug && !!eventSlug,
    refetchInterval: options.refetchInterval ?? 5_000,
    refetchOnWindowFocus: true,
  });
}
