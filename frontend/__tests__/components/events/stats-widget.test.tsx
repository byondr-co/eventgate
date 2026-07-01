import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/event-stats", () => ({
  useEventStats: vi.fn(),
}));

import { StatsWidget } from "@/components/events/stats-widget";
import { useEventStats, type EventStats } from "@/lib/event-stats";

const mockStats = vi.mocked(useEventStats);

beforeEach(() => {
  mockStats.mockReset();
});

it("renders skeleton tiles while loading", () => {
  mockStats.mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useEventStats>);
  const { container } = render(<StatsWidget orgSlug="o" eventSlug="e" />);
  expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(6);
  expect(screen.queryByText("Loading counts…")).not.toBeInTheDocument();
});

it("announces loading and hides the tile skeletons from assistive tech", () => {
  mockStats.mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useEventStats>);
  render(<StatsWidget orgSlug="o" eventSlug="e" />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Loading…");
  const hidden = status.querySelector('[aria-hidden="true"]');
  expect(hidden).not.toBeNull();
  expect(hidden?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
});

it("renders no skeleton once loaded", () => {
  mockStats.mockReturnValue({
    data: {
      checked_in: 1,
      registered_not_arrived: 2,
      displayed: 3,
      manual_review: 0,
      open_escalations: 0,
      conflicts_recent_15min: 0,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useEventStats>);
  render(<StatsWidget orgSlug="o" eventSlug="e" />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("colors warning tiles with text-warning and danger tiles with text-destructive", () => {
  mockStats.mockReturnValue({
    data: {
      checked_in: 1,
      registered_not_arrived: 2,
      displayed: 3,
      manual_review: 5,
      open_escalations: 0,
      conflicts_recent_15min: 4,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useEventStats>);

  render(<StatsWidget orgSlug="o" eventSlug="e" />);
  expect(screen.getByText("5").className).toContain("text-warning");
  expect(screen.getByText("4").className).toContain("text-destructive");
});

it("renders a supplied live snapshot without showing polling skeletons", () => {
  const snapshot: EventStats = {
    checked_in: 12,
    registered_not_arrived: 8,
    displayed: 3,
    manual_review: 1,
    total_walkins: 3,
    open_escalations: 0,
    conflicts_recent_15min: 0,
  };
  mockStats.mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useEventStats>);

  const { container } = render(<StatsWidget orgSlug="o" eventSlug="e" snapshot={snapshot} />);

  expect(screen.queryByRole("status")).toBeNull();
  expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByText("8")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(mockStats).toHaveBeenCalledWith("o", "e", {
    enabled: false,
    refetchInterval: false,
  });
});
