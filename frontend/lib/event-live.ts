"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEventStats, type EventLiveSnapshot } from "@/lib/event-stats";

export type EventLiveConnectionState = "connecting" | "live" | "reconnecting" | "polling";

type InvalidatePayload = {
  keys?: string[];
};

const FAILURE_LIMIT = 3;

function parseJson<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

function invalidateLiveKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  orgSlug: string,
  eventSlug: string,
  keys: string[],
) {
  if (keys.includes("stats")) {
    void queryClient.invalidateQueries({ queryKey: ["event-stats", orgSlug, eventSlug] });
  }
  if (keys.includes("audit")) {
    void queryClient.invalidateQueries({ queryKey: ["audit", orgSlug, eventSlug] });
  }
  if (keys.includes("helpdesk")) {
    void queryClient.invalidateQueries({ queryKey: ["helpdesk-tickets", orgSlug, eventSlug] });
    void queryClient.invalidateQueries({ queryKey: ["helpdesk-open-count", orgSlug, eventSlug] });
  }
  if (keys.includes("manual_review")) {
    void queryClient.invalidateQueries({
      queryKey: ["helpdesk-manual-review", orgSlug, eventSlug],
    });
  }
  if (keys.includes("guests_count")) {
    void queryClient.invalidateQueries({ queryKey: ["guests-count", orgSlug, eventSlug] });
  }
}

export function useEventLive(orgSlug: string, eventSlug: string) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<EventLiveSnapshot | undefined>();
  const [connectionState, setConnectionState] = useState<EventLiveConnectionState>("connecting");
  const failures = useRef(0);

  const polling = useEventStats(orgSlug, eventSlug, {
    enabled: connectionState === "polling" || !snapshot,
    refetchInterval: connectionState === "polling" ? 5_000 : false,
  });

  useEffect(() => {
    if (!orgSlug || !eventSlug) return;

    if (typeof window === "undefined") {
      const pollingTimer = setTimeout(() => setConnectionState("polling"), 0);
      return () => clearTimeout(pollingTimer);
    }

    if (typeof window.EventSource === "undefined") {
      const pollingTimer = window.setTimeout(() => setConnectionState("polling"), 0);
      return () => window.clearTimeout(pollingTimer);
    }

    failures.current = 0;
    let opened = false;
    const connectingTimer = window.setTimeout(() => {
      if (!opened) setConnectionState("connecting");
    }, 0);

    const source = new window.EventSource(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/live/`, {
      withCredentials: true,
    });

    source.onopen = () => {
      opened = true;
      window.clearTimeout(connectingTimer);
      failures.current = 0;
      setConnectionState("live");
    };

    source.onerror = () => {
      failures.current += 1;
      if (failures.current >= FAILURE_LIMIT) {
        source.close();
        setConnectionState("polling");
        return;
      }
      setConnectionState("reconnecting");
    };

    source.addEventListener("snapshot", (event) => {
      const nextSnapshot = parseJson<EventLiveSnapshot>(event.data);
      if (!nextSnapshot) return;
      setSnapshot(nextSnapshot);
      setConnectionState("live");
    });

    source.addEventListener("invalidate", (event) => {
      const payload = parseJson<InvalidatePayload>(event.data);
      if (!payload || !Array.isArray(payload.keys)) return;
      invalidateLiveKeys(queryClient, orgSlug, eventSlug, payload.keys);
    });

    return () => {
      window.clearTimeout(connectingTimer);
      source.close();
    };
  }, [eventSlug, orgSlug, queryClient]);

  return useMemo(
    () => ({
      snapshot: snapshot ?? (polling.data as EventLiveSnapshot | undefined),
      connectionState,
      isPollingFallback: connectionState === "polling",
      isLoading: !snapshot && polling.isLoading,
    }),
    [connectionState, polling.data, polling.isLoading, snapshot],
  );
}
