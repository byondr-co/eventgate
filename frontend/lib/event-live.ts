"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEventStats, type EventLiveSnapshot } from "@/lib/event-stats";

export type EventLiveConnectionState = "connecting" | "live" | "reconnecting" | "polling";

type InvalidatePayload = {
  keys?: string[];
};

type ScopedSnapshot = {
  orgSlug: string;
  eventSlug: string;
  data: EventLiveSnapshot;
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
  const [snapshot, setSnapshot] = useState<ScopedSnapshot | undefined>();
  const [connectionState, setConnectionState] = useState<EventLiveConnectionState>("connecting");
  const failures = useRef(0);
  const previousScope = useRef<string | undefined>(undefined);
  const currentSnapshot =
    snapshot?.orgSlug === orgSlug && snapshot.eventSlug === eventSlug ? snapshot.data : undefined;
  const shouldPollStats = connectionState === "polling" || !currentSnapshot;

  const polling = useEventStats(orgSlug, eventSlug, {
    enabled: shouldPollStats,
    refetchInterval: shouldPollStats ? 5_000 : false,
  });

  useEffect(() => {
    failures.current = 0;
    const scope = `${orgSlug}\u0000${eventSlug}`;
    const lastScope = previousScope.current;
    const shouldClearSnapshot =
      !orgSlug || !eventSlug || (lastScope !== undefined && lastScope !== scope);
    previousScope.current = scope;
    const clearSnapshotTimer = shouldClearSnapshot
      ? setTimeout(() => {
          setSnapshot((previous) => {
            if (!previous) return previous;
            if (!orgSlug || !eventSlug) return undefined;
            if (previous.orgSlug === orgSlug && previous.eventSlug === eventSlug) return previous;
            return undefined;
          });
        }, 0)
      : undefined;

    if (!orgSlug || !eventSlug) {
      const connectingTimer = setTimeout(() => setConnectionState("connecting"), 0);
      return () => {
        if (clearSnapshotTimer) clearTimeout(clearSnapshotTimer);
        clearTimeout(connectingTimer);
      };
    }

    if (typeof window === "undefined") {
      const pollingTimer = setTimeout(() => setConnectionState("polling"), 0);
      return () => {
        if (clearSnapshotTimer) clearTimeout(clearSnapshotTimer);
        clearTimeout(pollingTimer);
      };
    }

    if (typeof window.EventSource === "undefined") {
      const pollingTimer = window.setTimeout(() => setConnectionState("polling"), 0);
      return () => {
        if (clearSnapshotTimer) clearTimeout(clearSnapshotTimer);
        window.clearTimeout(pollingTimer);
      };
    }

    let active = true;
    let opened = false;
    const connectingTimer = window.setTimeout(() => {
      if (active && !opened) setConnectionState("connecting");
    }, 0);

    const source = new window.EventSource(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/live/`, {
      withCredentials: true,
    });

    source.onopen = () => {
      if (!active) return;
      opened = true;
      window.clearTimeout(connectingTimer);
      failures.current = 0;
      setConnectionState("live");
    };

    source.onerror = () => {
      if (!active) return;
      failures.current += 1;
      if (failures.current >= FAILURE_LIMIT) {
        source.close();
        setConnectionState("polling");
        return;
      }
      setConnectionState("reconnecting");
    };

    source.addEventListener("snapshot", (event) => {
      if (!active) return;
      const nextSnapshot = parseJson<EventLiveSnapshot>(event.data);
      if (!nextSnapshot) return;
      setSnapshot({ orgSlug, eventSlug, data: nextSnapshot });
      setConnectionState("live");
    });

    source.addEventListener("invalidate", (event) => {
      if (!active) return;
      const payload = parseJson<InvalidatePayload>(event.data);
      if (!payload || !Array.isArray(payload.keys)) return;
      invalidateLiveKeys(queryClient, orgSlug, eventSlug, payload.keys);
    });

    return () => {
      active = false;
      if (clearSnapshotTimer) clearTimeout(clearSnapshotTimer);
      window.clearTimeout(connectingTimer);
      source.close();
    };
  }, [eventSlug, orgSlug, queryClient]);

  const pollingSnapshot = polling.data as EventLiveSnapshot | undefined;
  const returnedSnapshot =
    connectionState === "polling" ? pollingSnapshot : (currentSnapshot ?? pollingSnapshot);

  return useMemo(
    () => ({
      snapshot: returnedSnapshot,
      connectionState,
      isPollingFallback: connectionState === "polling",
      isLoading: !returnedSnapshot && polling.isLoading,
    }),
    [connectionState, polling.isLoading, returnedSnapshot],
  );
}
