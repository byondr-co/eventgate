import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useEvents: () => ({
    data: {
      count: 1,
      results: [
        {
          id: "1",
          name: "Alpha Gala",
          slug: "alpha",
          status: "draft",
          starts_at: null,
          ends_at: null,
          timezone: "",
          venue: "",
          registration_open: true,
          walkins_enabled: true,
          walkin_capacity: 0,
          created_at: "2026-06-01",
          description: "",
          banner_image: null,
        },
      ],
    },
    isLoading: false,
  }),
}));

import { EventsTable } from "@/components/events/events-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders a search box and the event rows", () => {
  wrap(<EventsTable orgSlug="acme" />);
  expect(screen.getByPlaceholderText(/search events/i)).toBeInTheDocument();
  expect(screen.getByText("Alpha Gala")).toBeInTheDocument();
});
