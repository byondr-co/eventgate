import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("@/lib/guests", () => ({
  useGuests: vi.fn(),
  useSendQrEmail: vi.fn(),
  fetchTelegramLink: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  useFields: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { GuestsTable } from "@/components/guests/guests-table";
import { useFields, type RegistrationField } from "@/lib/events";
import { useGuests, useSendQrEmail, type Guest } from "@/lib/guests";

const mockUseGuests = vi.mocked(useGuests);
const mockUseSendQrEmail = vi.mocked(useSendQrEmail);
const mockUseFields = vi.mocked(useFields);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function field(over: Partial<RegistrationField>): RegistrationField {
  return {
    id: "f",
    field_key: "name",
    label_en: "Full name",
    label_km: "",
    field_type: "text",
    required: false,
    options_json: [],
    order_index: 0,
    is_preset: true,
    ...over,
  } as RegistrationField;
}

const PRESET_FIELDS: RegistrationField[] = [
  field({ field_key: "name", label_en: "Full name", order_index: 0 }),
  field({ field_key: "email", label_en: "Email", field_type: "email", order_index: 1 }),
  field({ field_key: "phone_or_chat", label_en: "Phone or Chat", order_index: 2 }),
];

function setFields(list: RegistrationField[] = PRESET_FIELDS) {
  mockUseFields.mockReturnValue({
    data: { count: list.length, results: list },
    isLoading: false,
  } as unknown as ReturnType<typeof useFields>);
}

function guest(over: Partial<Guest>): Guest {
  return {
    id: "g1",
    guest_type: "pre_registered",
    entry_status: "registered_not_arrived",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    phone_or_chat: "+855...",
    custom_fields: {},
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
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setFields();
  mockUseSendQrEmail.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSendQrEmail>);
});

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
    expect(screen.queryByText("checked_in")).not.toBeInTheDocument();
  });

  it("numbers rows continuing across pages", () => {
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

describe("GuestsTable dynamic columns reflect the registration form", () => {
  it("renders a column per registration field and reads custom_fields", () => {
    setFields([
      field({ field_key: "name", label_en: "Full name", order_index: 0 }),
      field({ field_key: "company", label_en: "Company", is_preset: false, order_index: 1 }),
    ]);
    setGuests([
      guest({ id: "g1", full_name: "Ada", custom_fields: { company: "Analytical Engines" } }),
    ]);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByText("Analytical Engines")).toBeInTheDocument();
    // A preset not present in the event's fields gets no column.
    expect(screen.queryByRole("columnheader", { name: "Phone or Chat" })).not.toBeInTheDocument();
  });
});

describe("GuestsTable page-size persistence", () => {
  it("restores the persisted page size on mount and requests it", () => {
    localStorage.setItem("guests.pageSize", "100");
    setGuests([guest({ id: "g1", full_name: "Solo" })], 200);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect(select.value).toBe("100");
    expect(mockUseGuests).toHaveBeenCalledWith(
      "o",
      "e",
      expect.objectContaining({ pageSize: 100, page: 1 }),
    );
  });

  it("defaults to 25 and ignores an invalid persisted value", () => {
    localStorage.setItem("guests.pageSize", "37");
    setGuests([guest({ id: "g1", full_name: "Solo" })], 200);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect((screen.getByLabelText("Rows per page") as HTMLSelectElement).value).toBe("25");
  });

  it("persists the selection when changed", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 200);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    expect(localStorage.getItem("guests.pageSize")).toBe("50");
  });
});

describe("GuestsTable segmented filters", () => {
  it("requests guest_type=walk_in when the Walk-in segment is clicked", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ guestType: "walk_in", page: 1 }),
    );
  });

  it("clears the entry filter when All is selected in the entry group", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.click(screen.getByRole("button", { name: "Checked-in" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ entryStatus: "checked_in" }),
    );
    const entryGroup = screen.getByRole("group", { name: "Filter by entry status" });
    fireEvent.click(within(entryGroup).getByRole("button", { name: "All" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ entryStatus: "" }),
    );
  });
});

describe("GuestsTable frozen columns", () => {
  it("makes the No and Actions columns sticky without divider borders", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    const noHeader = screen.getByRole("columnheader", { name: "No" });
    expect(noHeader.className).toContain("sticky");
    expect(noHeader.className).toContain("left-0");
    expect(noHeader.className).not.toContain("border-r");
    const actionsHeader = screen.getByRole("columnheader", { name: "Actions" });
    expect(actionsHeader.className).toContain("sticky");
    expect(actionsHeader.className).toContain("right-0");
    expect(actionsHeader.className).not.toContain("border-l");
  });
});
