import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/guests", () => ({
  useGuests: () => ({
    data: {
      count: 1,
      results: [
        {
          id: "g1",
          guest_type: "pre_registered",
          entry_status: "registered_not_arrived",
          info_status: "info_completed",
          full_name: "Ana",
          email: "a@x.com",
          phone_or_chat: "",
          custom_fields: {},
          source: "",
          checked_in_at: null,
          created_at: "2026-06-01",
        },
      ],
    },
    isLoading: false,
  }),
  useSendQrEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkGuests: () => ({ mutateAsync: vi.fn(), isPending: false }),
  exportGuestsCsv: vi.fn(),
  fetchTelegramLink: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ useFields: () => ({ data: { results: [] } }) }));

import { GuestsTable } from "@/components/guests/guests-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders an Export CSV button and per-row select checkboxes", () => {
  wrap(<GuestsTable orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
});
