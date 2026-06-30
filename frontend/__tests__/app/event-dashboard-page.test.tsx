import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch" }),
}));
vi.mock("@/lib/events", () => ({ useEvent: vi.fn() }));
vi.mock("@/lib/event-live", () => ({ useEventLive: vi.fn() }));
vi.mock("@/lib/event-stats", () => ({ useEventStats: vi.fn() }));
vi.mock("@/components/events/event-status-card", () => ({
  EventStatusCard: () => <div data-testid="event-status-card" />,
}));
vi.mock("@/components/events/public-url-card", () => ({
  PublicUrlCard: () => <div data-testid="public-url-card" />,
}));

import EventDashboardPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/page";
import { useEventLive } from "@/lib/event-live";
import { useEvent } from "@/lib/events";
import { useEventStats, type EventLiveSnapshot } from "@/lib/event-stats";

const mockUseEvent = vi.mocked(useEvent);
const mockUseEventLive = vi.mocked(useEventLive);
const mockUseEventStats = vi.mocked(useEventStats);
type EventResult = ReturnType<typeof useEvent>;
type EventLiveResult = ReturnType<typeof useEventLive>;

const liveSnapshot: EventLiveSnapshot = {
  checked_in: 31,
  registered_not_arrived: 14,
  displayed: 5,
  manual_review: 2,
  total_walkins: 5,
  open_escalations: 1,
  conflicts_recent_15min: 0,
  as_of: "2026-06-29T12:25:00Z",
  analytics: {
    throughput_5m: {
      checkins: 18,
      per_minute: 3.6,
      window_start: "2026-06-29T12:20:00Z",
      window_end: "2026-06-29T12:25:00Z",
    },
    peak_5m: {
      checkins: 42,
      per_minute: 8.4,
      window_start: "2026-06-29T11:40:00Z",
      window_end: "2026-06-29T11:45:00Z",
    },
    gate_utilization_15m: [
      {
        gate: "North Gate",
        scanner: "Scanner A1",
        checkins: 34,
        duplicates: 2,
        conflicts: 1,
        share: 0.48,
        per_minute: 2.27,
      },
    ],
    trend_60m: [{ bucket_start: "2026-06-29T12:00:00Z", checkins: 2 }],
  },
  recent_activity: [
    {
      id: "a1",
      occurred_at: "2026-06-29T12:24:03Z",
      action: "checkin.success",
      result: "success",
      gate: "North Gate",
      scanner: "Scanner A1",
      guest_id: "g1",
      guest_label: "Ana Sok",
    },
  ],
};

describe("EventDashboardPage", () => {
  beforeEach(() => {
    mockUseEvent.mockReset();
    mockUseEventLive.mockReset();
    mockUseEventStats.mockReset();
    mockUseEventLive.mockReturnValue({
      snapshot: liveSnapshot,
      connectionState: "live",
      isPollingFallback: false,
      isLoading: false,
    } as EventLiveResult);
    mockUseEventStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useEventStats>);
  });

  it("renders a shaped skeleton while loading", () => {
    mockUseEvent.mockReturnValue({ data: undefined, isLoading: true } as unknown as EventResult);
    render(<EventDashboardPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the dashboard once loaded, with no skeleton", () => {
    mockUseEvent.mockReturnValue({
      data: { id: "1", name: "Launch Party", slug: "launch", status: "live", venue: "" },
      isLoading: false,
    } as unknown as EventResult);
    render(<EventDashboardPage />);
    expect(screen.getByText("Launch Party")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByTestId("event-status-card")).toBeInTheDocument();
    expect(screen.getByText("Checked in")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("Throughput")).toBeInTheDocument();
    expect(screen.getByText("Gate Utilization")).toBeInTheDocument();
    expect(screen.getByText("Peak 5m Window")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Ana Sok")).toBeInTheDocument();
    expect(screen.getByTestId("public-url-card")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(mockUseEventStats).toHaveBeenCalledWith("acme", "launch", {
      enabled: false,
      refetchInterval: false,
    });
  });
});
