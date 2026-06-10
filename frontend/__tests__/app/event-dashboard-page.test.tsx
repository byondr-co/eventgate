import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch" }),
}));
vi.mock("@/lib/events", () => ({ useEvent: vi.fn() }));
vi.mock("@/components/events/event-status-card", () => ({
  EventStatusCard: () => <div data-testid="event-status-card" />,
}));
vi.mock("@/components/events/stats-widget", () => ({
  StatsWidget: () => <div data-testid="stats-widget" />,
}));
vi.mock("@/components/events/public-url-card", () => ({
  PublicUrlCard: () => <div data-testid="public-url-card" />,
}));

import EventDashboardPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/page";
import { useEvent } from "@/lib/events";

const mockUseEvent = vi.mocked(useEvent);
type EventResult = ReturnType<typeof useEvent>;

describe("EventDashboardPage", () => {
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
    expect(screen.getByTestId("event-status-card")).toBeInTheDocument();
    expect(screen.getByTestId("stats-widget")).toBeInTheDocument();
    expect(screen.getByTestId("public-url-card")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
