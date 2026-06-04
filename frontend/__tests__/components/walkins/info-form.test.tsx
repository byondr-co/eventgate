import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mocks must be hoisted before component imports.
vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("@/lib/walkins", () => ({
  useCompleteInfo: vi.fn(),
}));

import { WalkinInfoForm } from "@/components/walkins/info-form";
import type { PublicEventField } from "@/lib/events";
import { useCompleteInfo } from "@/lib/walkins";

const mockUseCompleteInfo = vi.mocked(useCompleteInfo);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const nameField: PublicEventField = {
  field_key: "name",
  label_en: "Full name",
  label_km: "ឈ្មោះ",
  field_type: "text",
  required: true,
  options: [],
  order_index: 0,
};

const customField: PublicEventField = {
  field_key: "company",
  label_en: "Company",
  label_km: "ក្រុមហ៊ុន",
  field_type: "text",
  required: false,
  options: [],
  order_index: 1,
};

function setMutation(over: Partial<ReturnType<typeof useCompleteInfo>> = {}) {
  mockUseCompleteInfo.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    ...over,
  } as unknown as ReturnType<typeof useCompleteInfo>);
}

describe("WalkinInfoForm", () => {
  it("renders fields data-driven from props (no hardcoded presets)", () => {
    setMutation();
    wrap(
      <WalkinInfoForm
        orgSlug="o"
        eventSlug="e"
        token="t"
        eventName="My Event"
        fields={[nameField, customField]}
      />,
    );
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/)).toBeInTheDocument();
    // A preset that is NOT in the event's fields must not appear.
    expect(screen.queryByText(/Phone or Chat/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
  });

  it("renders the banner image when provided", () => {
    setMutation();
    const { container } = wrap(
      <WalkinInfoForm
        orgSlug="o"
        eventSlug="e"
        token="t"
        eventName="My Event"
        fields={[nameField]}
        bannerImage="https://cdn.example.com/banner.webp?sig=1"
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("banner.webp");
  });

  it("marks non-required fields Optional and leaves required ones unmarked", () => {
    setMutation();
    wrap(
      <WalkinInfoForm
        orgSlug="o"
        eventSlug="e"
        token="t"
        eventName="Test Event"
        fields={[nameField, customField]}
      />,
    );
    const company = screen.getByText(/Company/).closest("label")!;
    expect(within(company).getByText("Optional")).toBeInTheDocument();
    const fullName = screen.getByText(/Full name/).closest("label")!;
    expect(within(fullName).queryByText("Optional")).not.toBeInTheDocument();
  });

  it("blocks submit with an inline error when a required field is empty", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setMutation({ mutateAsync } as never);
    wrap(
      <WalkinInfoForm
        orgSlug="o"
        eventSlug="e"
        token="t"
        eventName="My Event"
        fields={[nameField]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Save my info/ }));
    expect(screen.getByText("This field is required.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
