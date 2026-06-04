import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-stats", () => ({
  useEventStats: vi.fn(),
}));

import { StatsWidget } from "@/components/events/stats-widget";
import { useEventStats } from "@/lib/event-stats";

const mockStats = vi.mocked(useEventStats);

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
