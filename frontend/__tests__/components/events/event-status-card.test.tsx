import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventStatusCard } from "@/components/events/event-status-card";
import { EVENT_TRANSITIONS } from "@/lib/events";
import type { EventStatus } from "@/lib/events";

// Stub apiFetch so no real network calls happen
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
const mockApiFetch = vi.mocked(apiFetch);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

type EventLike = { status: EventStatus; name: string; slug: string };

function makeEvent(status: EventStatus): EventLike {
  return { status, name: "Test Event", slug: "test-event" };
}

// ---------------------------------------------------------------------------
// Badge rendering
// ---------------------------------------------------------------------------

describe("EventStatusCard badge", () => {
  it("renders the current status text in a badge", () => {
    wrap(<EventStatusCard event={makeEvent("draft")} orgSlug="acme" eventSlug="test-event" />);
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("renders 'open' badge for open event", () => {
    wrap(<EventStatusCard event={makeEvent("open")} orgSlug="acme" eventSlug="test-event" />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Transition buttons per status (parameterized)
// ---------------------------------------------------------------------------

describe("EventStatusCard transition buttons", () => {
  const cases: Array<{ status: EventStatus; expectedLabels: string[] }> = [
    { status: "draft", expectedLabels: ["Publish"] },
    { status: "open", expectedLabels: ["Go live", "Unpublish"] },
    { status: "live", expectedLabels: ["Close"] },
    { status: "closed", expectedLabels: ["Reopen", "Archive"] },
    { status: "archived", expectedLabels: [] },
  ];

  cases.forEach(({ status, expectedLabels }) => {
    it(`renders ${expectedLabels.length === 0 ? "no buttons" : expectedLabels.join(", ")} for ${status}`, () => {
      wrap(<EventStatusCard event={makeEvent(status)} orgSlug="acme" eventSlug="test-event" />);

      if (expectedLabels.length === 0) {
        // Should have no buttons
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      } else {
        for (const label of expectedLabels) {
          expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
        }
        // No extra buttons
        const buttons = screen.getAllByRole("button");
        expect(buttons).toHaveLength(expectedLabels.length);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Archived special message
// ---------------------------------------------------------------------------

describe("EventStatusCard archived state", () => {
  it("shows the archived message when status is archived", () => {
    wrap(<EventStatusCard event={makeEvent("archived")} orgSlug="acme" eventSlug="test-event" />);
    expect(screen.getByText(/Archived events cannot be modified/i)).toBeInTheDocument();
  });

  it("does not show the archived message for non-archived statuses", () => {
    wrap(<EventStatusCard event={makeEvent("draft")} orgSlug="acme" eventSlug="test-event" />);
    expect(screen.queryByText(/Archived events cannot be modified/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mutation called with correct status
// ---------------------------------------------------------------------------

describe("EventStatusCard mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls mutate with the target status when a transition button is clicked", async () => {
    mockApiFetch.mockResolvedValue({ status: "open", id: "1", name: "T", slug: "t" } as never);

    wrap(<EventStatusCard event={makeEvent("draft")} orgSlug="acme" eventSlug="test-event" />);
    const btn = screen.getByRole("button", { name: "Publish" });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/v1/orgs/acme/events/test-event/transition/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "open" }),
        }),
      );
    });
  });

  it("disables buttons while mutation is pending", async () => {
    // Never resolve to keep the mutation pending
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    wrap(<EventStatusCard event={makeEvent("draft")} orgSlug="acme" eventSlug="test-event" />);
    const btn = screen.getByRole("button", { name: "Publish" });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------
// EVENT_TRANSITIONS export
// ---------------------------------------------------------------------------

describe("EVENT_TRANSITIONS constant", () => {
  it("draft allows only open", () => {
    const targets = EVENT_TRANSITIONS.draft.map((t) => t.target);
    expect(targets).toEqual(["open"]);
  });

  it("open allows draft and live", () => {
    const targets = EVENT_TRANSITIONS.open.map((t) => t.target).sort();
    expect(targets).toEqual(["draft", "live"].sort());
  });

  it("live allows only closed", () => {
    const targets = EVENT_TRANSITIONS.live.map((t) => t.target);
    expect(targets).toEqual(["closed"]);
  });

  it("closed allows open and archived", () => {
    const targets = EVENT_TRANSITIONS.closed.map((t) => t.target).sort();
    expect(targets).toEqual(["archived", "open"].sort());
  });

  it("archived allows nothing", () => {
    expect(EVENT_TRANSITIONS.archived).toHaveLength(0);
  });
});
