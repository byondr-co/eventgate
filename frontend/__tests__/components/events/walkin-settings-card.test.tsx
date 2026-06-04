import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({ useEvent: vi.fn(), useUpdateEvent: vi.fn() }));

import { WalkinSettingsCard } from "@/components/events/walkin-settings-card";
import { useEvent, useUpdateEvent } from "@/lib/events";

const mockEvent = vi.mocked(useEvent);
const mockUpdate = vi.mocked(useUpdateEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockEvent.mockReturnValue({ data: { walkin_capacity: 0 }, isLoading: false } as never);
});

describe("WalkinSettingsCard", () => {
  it("labels the capacity field via Field", () => {
    mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<WalkinSettingsCard orgSlug="o" eventSlug="e" />);
    expect(screen.getByLabelText("Capacity")).toBeInTheDocument();
  });

  it("shows the success message in the success token color", async () => {
    mockUpdate.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ walkin_capacity: 50 }),
      isPending: false,
    } as never);
    render(<WalkinSettingsCard orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByLabelText("Capacity"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const msg = await screen.findByText(/Saved\. Cap set to 50\./);
    expect(msg.className).toContain("text-success");
  });
});
