import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guests", () => ({
  useGuests: vi.fn(),
  useSendQrEmail: vi.fn(),
  fetchTelegramLink: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { GuestsTable } from "@/components/guests/guests-table";
import type { Guest } from "@/lib/guests";
import { useGuests, useSendQrEmail } from "@/lib/guests";

const mockUseGuests = vi.mocked(useGuests);
const mockUseSendQrEmail = vi.mocked(useSendQrEmail);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function guest(over: Partial<Guest>): Guest {
  return {
    id: "g1",
    guest_type: "pre_registered",
    entry_status: "registered_not_arrived",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    phone_or_chat: "+855...",
    source: "",
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  } as Guest;
}

function setGuests(results: Guest[]) {
  mockUseGuests.mockReturnValue({
    data: { count: results.length, results },
    isLoading: false,
  } as unknown as ReturnType<typeof useGuests>);
  mockUseSendQrEmail.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSendQrEmail>);
}

describe("GuestsTable walk-in vs pre-registered", () => {
  it("shows Email QR / Copy Telegram actions for pre-registered guests", () => {
    setGuests([guest({ id: "g1", guest_type: "pre_registered", full_name: "Pre Reg" })]);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const row = screen.getByText("Pre Reg").closest("tr")!;
    expect(within(row).getByText("Pre-registered")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Email QR/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Copy Telegram link/ })).toBeInTheDocument();
  });

  it("hides Email QR / Copy Telegram actions for walk-in guests and tags them", () => {
    setGuests([guest({ id: "g2", guest_type: "walk_in", full_name: "Walk In" })]);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const row = screen.getByText("Walk In").closest("tr")!;
    expect(within(row).getByText("Walk-in")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Email QR/ })).not.toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: /Copy Telegram link/ }),
    ).not.toBeInTheDocument();
  });
});
