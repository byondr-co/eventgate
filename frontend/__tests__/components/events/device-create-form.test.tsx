import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/devices", () => ({
  useCreateDevice: vi.fn(),
}));

import { DeviceCreateForm } from "@/components/events/device-create-form";
import { useCreateDevice } from "@/lib/devices";

const mockUseCreateDevice = vi.mocked(useCreateDevice);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeviceCreateForm error handling", () => {
  it("shows the extracted field message, not the raw 400 body", async () => {
    // apiFetch throws Error("<status> <statusText>: <body>").
    const err = new Error(
      '400 : {"label":["A device with this label and role already exists for this event."]}',
    );
    mockUseCreateDevice.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(err),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateDevice>);

    render(<DeviceCreateForm orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Gate 1 Lane A"), {
      target: { value: "Gate A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create device/ }));

    await waitFor(() =>
      expect(
        screen.getByText("A device with this label and role already exists for this event."),
      ).toBeInTheDocument(),
    );
    // The raw JSON / status line must not leak.
    expect(screen.queryByText(/^400/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{"label"/)).not.toBeInTheDocument();
  });

  it("wires aria-invalid and aria-describedby onto the label input on field error", async () => {
    const err = new Error('400 : {"label":["A device with this label and role already exists."]}');
    mockUseCreateDevice.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(err),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateDevice>);

    render(<DeviceCreateForm orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Gate 1 Lane A"), {
      target: { value: "Gate A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create device/ }));

    const input = await screen.findByPlaceholderText("e.g. Gate 1 Lane A");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAttribute("aria-describedby", "device-label-error");
  });

  it("shows the enrollment code with a copy button and no amber styling", async () => {
    mockUseCreateDevice.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ enrollment_code: "EG-7H2K-9QX4-MN03" }),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateDevice>);

    const { container } = render(<DeviceCreateForm orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Gate 1 Lane A"), {
      target: { value: "Gate A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create device/ }));

    await waitFor(() => expect(screen.getByText("EG-7H2K-9QX4-MN03")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
    expect(container.querySelector('[class*="amber"]')).toBeNull();
  });
});
