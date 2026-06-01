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

function setGuests(results: Guest[], count = results.length) {
  mockUseGuests.mockReturnValue({
    data: { count, results },
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

describe("GuestsTable entry status + numbering + pagination", () => {
  it("humanizes entry statuses and renders Checked-in distinctly", () => {
    setGuests([
      guest({ id: "g1", full_name: "Reg", entry_status: "registered_not_arrived" }),
      guest({ id: "g2", full_name: "In", entry_status: "checked_in" }),
    ]);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("Registered, not arrived")).toBeInTheDocument();
    const inRow = screen.getByText("In").closest("tr")!;
    const checkedIn = within(inRow).getByText("Checked-in");
    expect(checkedIn).toBeInTheDocument();
    expect(checkedIn.className).toContain("bg-green-600");
    // Raw status codes must not leak.
    expect(screen.queryByText("checked_in")).not.toBeInTheDocument();
  });

  it("numbers rows continuing across pages", () => {
    // 60 total, page size 25 → first page rows numbered 1..2 here (2 results shown).
    setGuests(
      [guest({ id: "a", full_name: "First" }), guest({ id: "b", full_name: "Second" })],
      60,
    );
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const firstRow = screen.getByText("First").closest("tr")!;
    expect(within(firstRow).getByText("1")).toBeInTheDocument();
    const secondRow = screen.getByText("Second").closest("tr")!;
    expect(within(secondRow).getByText("2")).toBeInTheDocument();
  });

  it("offers an adjustable page-size dropdown (25/50/100)", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 200);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["25", "50", "100"]);
  });
});
