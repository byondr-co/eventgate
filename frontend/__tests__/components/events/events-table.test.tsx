import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({ useEvents: vi.fn() }));

import { EventsTable, eventStatusVariant } from "@/components/events/events-table";
import type { EventStatus } from "@/lib/events";
import { useEvents } from "@/lib/events";

const mockEvents = vi.mocked(useEvents);

beforeEach(() => vi.clearAllMocks());

describe("EventsTable", () => {
  it("shows the EmptyState when there are no events", () => {
    mockEvents.mockReturnValue({ data: { results: [] }, isLoading: false } as never);
    render(<EventsTable orgSlug="o" />);
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  it("lists events with status badges when present", () => {
    mockEvents.mockReturnValue({
      data: { results: [{ id: "1", name: "Gala", slug: "gala", status: "open" }] },
      isLoading: false,
    } as never);
    render(<EventsTable orgSlug="o" />);
    expect(screen.getByText("Gala")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });
});

describe("eventStatusVariant", () => {
  const cases: Array<[EventStatus, string]> = [
    ["draft", "outline"],
    ["open", "secondary"],
    ["live", "default"],
    ["closed", "destructive"],
    ["archived", "ghost"],
  ];

  it.each(cases)("status '%s' → variant '%s'", (status, expectedVariant) => {
    expect(eventStatusVariant(status)).toBe(expectedVariant);
  });
});
