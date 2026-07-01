import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GateUtilizationPanel } from "@/components/events/gate-utilization-panel";
import { LiveStatusBadge } from "@/components/events/live-status-badge";
import { PeakWindowPanel } from "@/components/events/peak-window-panel";
import { RecentActivityPanel } from "@/components/events/recent-activity-panel";
import { ThroughputPanel } from "@/components/events/throughput-panel";
import type { EventAnalytics, RecentActivity } from "@/lib/event-stats";

const analytics: EventAnalytics = {
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
  trend_60m: [
    { bucket_start: "2026-06-29T12:00:00Z", checkins: 2 },
    { bucket_start: null, checkins: 0 },
    { bucket_start: "2026-06-29T12:10:00Z", checkins: 5 },
  ],
};

const activity: RecentActivity[] = [
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
  {
    id: "a2",
    occurred_at: null,
    action: "helpdesk.manual_review_resolved",
    result: "warning",
    gate: "",
    scanner: "",
    guest_id: null,
    guest_label: "",
  },
];

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

describe("LiveStatusBadge", () => {
  it.each([
    ["connecting", "Connecting"],
    ["live", "Live"],
    ["reconnecting", "Reconnecting"],
    ["polling", "Polling"],
  ] as const)("renders the %s state label", (state, label) => {
    render(<LiveStatusBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("ThroughputPanel", () => {
  it("renders the 5 minute throughput rate, count, and 60 minute trend", () => {
    render(<ThroughputPanel analytics={analytics} />);

    expect(screen.getByText("Throughput")).toBeInTheDocument();
    expect(screen.getByText("3.6/min")).toBeInTheDocument();
    expect(screen.getByText("18 check-ins in 5m")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "60 minute check-in trend" }).children).toHaveLength(3);
  });

  it("falls back to zero throughput when analytics are missing", () => {
    render(<ThroughputPanel />);

    expect(screen.getByText("0/min")).toBeInTheDocument();
    expect(screen.getByText("0 check-ins in 5m")).toBeInTheDocument();
  });
});

describe("PeakWindowPanel", () => {
  it("renders peak count, formatted window, and peak rate", () => {
    render(<PeakWindowPanel analytics={analytics} />);

    expect(screen.getByText("Peak 5m Window")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(
      screen.getByText(
        `${timeLabel("2026-06-29T11:40:00Z")} - ${timeLabel("2026-06-29T11:45:00Z")}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("8.4/min peak")).toBeInTheDocument();
  });

  it("renders the empty peak state when analytics are missing", () => {
    render(<PeakWindowPanel />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No peak yet")).toBeInTheDocument();
    expect(screen.getByText("0/min peak")).toBeInTheDocument();
  });
});

describe("GateUtilizationPanel", () => {
  it("renders gate and scanner utilization rows", () => {
    render(<GateUtilizationPanel analytics={analytics} />);

    expect(screen.getByText("Gate Utilization")).toBeInTheDocument();
    expect(screen.getByText("North Gate")).toBeInTheDocument();
    expect(screen.getByText("Scanner A1")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("34 check-ins · 2.27/min")).toBeInTheDocument();
  });

  it("renders an empty state when no gate rows are present", () => {
    render(<GateUtilizationPanel analytics={{ ...analytics, gate_utilization_15m: [] }} />);

    expect(screen.getByText("No gate activity in the last 15 minutes.")).toBeInTheDocument();
  });
});

describe("RecentActivityPanel", () => {
  it("renders recent activity guest labels, actions, and gate context", () => {
    render(<RecentActivityPanel items={activity} />);

    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText(timeLabel("2026-06-29T12:24:03Z"))).toBeInTheDocument();
    expect(screen.getByText("Ana Sok")).toBeInTheDocument();
    expect(screen.getByText("Checkin Success")).toBeInTheDocument();
    expect(screen.getByText("North Gate")).toBeInTheDocument();

    const fallbackRow = screen.getByText("Helpdesk Manual Review Resolved").closest("li");
    expect(fallbackRow).not.toBeNull();
    expect(
      within(fallbackRow as HTMLElement).getByText("Helpdesk Manual Review Resolved"),
    ).toBeInTheDocument();
  });

  it("renders an empty state when there is no recent activity", () => {
    render(<RecentActivityPanel items={[]} />);

    expect(screen.getByText("No recent operational activity.")).toBeInTheDocument();
  });
});
