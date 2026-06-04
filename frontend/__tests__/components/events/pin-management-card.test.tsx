import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/devices", () => ({ useSetPin: vi.fn() }));

import { PinManagementCard } from "@/components/events/pin-management-card";
import { useSetPin } from "@/lib/devices";

const mockSetPin = vi.mocked(useSetPin);

beforeEach(() => vi.clearAllMocks());

describe("PinManagementCard", () => {
  it("labels both PIN fields via Field", () => {
    mockSetPin.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<PinManagementCard orgSlug="o" eventSlug="e" />);
    expect(screen.getByLabelText("New PIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm PIN")).toBeInTheDocument();
  });

  it("shows the success message in the success token color", async () => {
    mockSetPin.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ rotated_at: "2026-06-04T00:00:00Z" }),
      isPending: false,
    } as never);
    render(<PinManagementCard orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByLabelText("New PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Set \/ rotate PIN/ }));
    const msg = await screen.findByText(/PIN updated at/);
    expect(msg.className).toContain("text-success");
  });
});
