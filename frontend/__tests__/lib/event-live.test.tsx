import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/event-stats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/event-stats")>("@/lib/event-stats");
  return {
    ...actual,
    useEventStats: vi.fn(() => ({ data: undefined, isLoading: false })),
  };
});

import { useEventLive } from "@/lib/event-live";
import { useEventStats, type EventLiveSnapshot, type TrendPoint } from "@/lib/event-stats";

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  options?: EventSourceInit;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Listener>();
  closed = false;

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.options = options;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    this.listeners.set(type, cb);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

const mockUseEventStats = vi.mocked(useEventStats);

function wrapper(qc: QueryClient) {
  function QueryClientTestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  QueryClientTestWrapper.displayName = "QueryClientTestWrapper";

  return QueryClientTestWrapper;
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function liveSnapshot(checkedIn = 1): EventLiveSnapshot {
  return {
    checked_in: checkedIn,
    registered_not_arrived: 2,
    manual_review: 0,
    displayed: 0,
    total_walkins: 0,
    open_escalations: 0,
    conflicts_recent_15min: 0,
    analytics: {
      throughput_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null },
      peak_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null },
      gate_utilization_15m: [],
      trend_60m: [],
    },
    recent_activity: [],
    as_of: "2026-06-29T00:00:00Z",
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  mockUseEventStats.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<
    typeof useEventStats
  >);
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("opens the event live URL and stores snapshot events", async () => {
  const qc = queryClient();
  const { result } = renderHook(() => useEventLive("acme", "launch"), {
    wrapper: wrapper(qc),
  });

  expect(FakeEventSource.instances[0].url).toBe("/api/v1/orgs/acme/events/launch/live/");
  expect(FakeEventSource.instances[0].options).toEqual({ withCredentials: true });

  act(() => {
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].emit("snapshot", liveSnapshot());
  });

  await waitFor(() => expect(result.current.connectionState).toBe("live"));
  expect(result.current.snapshot?.checked_in).toBe(1);
  expect(result.current.isPollingFallback).toBe(false);
});

it("invalidates query keys from invalidate events", async () => {
  const qc = queryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  renderHook(() => useEventLive("acme", "launch"), { wrapper: wrapper(qc) });

  act(() => {
    FakeEventSource.instances[0].emit("invalidate", {
      keys: ["stats", "audit", "helpdesk", "manual_review", "guests_count"],
    });
  });

  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith({ queryKey: ["event-stats", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["audit", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["helpdesk-tickets", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["helpdesk-open-count", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({
    queryKey: ["helpdesk-manual-review", "acme", "launch"],
  });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["guests-count", "acme", "launch"] });
});

it("falls back to polling after repeated errors and closes the source", async () => {
  const qc = queryClient();
  const { result } = renderHook(() => useEventLive("acme", "launch"), {
    wrapper: wrapper(qc),
  });

  act(() => {
    FakeEventSource.instances[0].onerror?.();
  });
  await waitFor(() => expect(result.current.connectionState).toBe("reconnecting"));

  act(() => {
    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onerror?.();
  });

  await waitFor(() => expect(result.current.connectionState).toBe("polling"));
  expect(FakeEventSource.instances[0].closed).toBe(true);
  expect(result.current.isPollingFallback).toBe(true);
  expect(mockUseEventStats).toHaveBeenLastCalledWith("acme", "launch", {
    enabled: true,
    refetchInterval: 5_000,
  });
});

it("prefers polling data after repeated errors when an SSE snapshot already exists", async () => {
  const qc = queryClient();
  const { result } = renderHook(() => useEventLive("acme", "launch"), {
    wrapper: wrapper(qc),
  });

  act(() => {
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].emit("snapshot", liveSnapshot(1));
  });

  await waitFor(() => expect(result.current.snapshot?.checked_in).toBe(1));

  mockUseEventStats.mockReturnValue({ data: liveSnapshot(9), isLoading: false } as ReturnType<
    typeof useEventStats
  >);

  act(() => {
    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onerror?.();
  });

  await waitFor(() => expect(result.current.connectionState).toBe("polling"));
  expect(result.current.snapshot?.checked_in).toBe(9);
});

it("clears the previous snapshot and reconnects when event slugs change", async () => {
  const qc = queryClient();
  const { result, rerender } = renderHook(
    ({ orgSlug, eventSlug }) => useEventLive(orgSlug, eventSlug),
    {
      initialProps: { orgSlug: "acme", eventSlug: "launch" },
      wrapper: wrapper(qc),
    },
  );

  act(() => {
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].emit("snapshot", liveSnapshot(1));
  });

  await waitFor(() => expect(result.current.snapshot?.checked_in).toBe(1));

  rerender({ orgSlug: "beta", eventSlug: "expo" });

  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
  expect(FakeEventSource.instances[0].closed).toBe(true);
  expect(FakeEventSource.instances[1].url).toBe("/api/v1/orgs/beta/events/expo/live/");
  await waitFor(() => expect(result.current.snapshot).toBeUndefined());
});

it("clears the previous snapshot when event slugs become missing", async () => {
  const qc = queryClient();
  const { result, rerender } = renderHook(
    ({ orgSlug, eventSlug }) => useEventLive(orgSlug, eventSlug),
    {
      initialProps: { orgSlug: "acme", eventSlug: "launch" },
      wrapper: wrapper(qc),
    },
  );

  act(() => {
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].emit("snapshot", liveSnapshot(1));
  });

  await waitFor(() => expect(result.current.snapshot?.checked_in).toBe(1));

  rerender({ orgSlug: "", eventSlug: "" });

  expect(FakeEventSource.instances[0].closed).toBe(true);
  expect(FakeEventSource.instances).toHaveLength(1);
  await waitFor(() => expect(result.current.snapshot).toBeUndefined());
});

it("uses polling immediately when EventSource is unavailable", async () => {
  vi.stubGlobal("EventSource", undefined);
  const qc = queryClient();
  const { result } = renderHook(() => useEventLive("acme", "launch"), {
    wrapper: wrapper(qc),
  });

  await waitFor(() => expect(result.current.connectionState).toBe("polling"));
  expect(FakeEventSource.instances).toHaveLength(0);
  expect(mockUseEventStats).toHaveBeenLastCalledWith("acme", "launch", {
    enabled: true,
    refetchInterval: 5_000,
  });
});

it("allows trend points with null bucket starts from the stats contract", () => {
  const point = { bucket_start: null, checkins: 0 } satisfies TrendPoint;

  expect(point.bucket_start).toBeNull();
});
