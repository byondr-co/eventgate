import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/devices", () => ({
  useDevices: vi.fn(),
  useRevokeDevice: vi.fn(),
}));

import { DeviceTable } from "@/components/events/device-table";
import { useDevices, useRevokeDevice } from "@/lib/devices";

const mockUseDevices = vi.mocked(useDevices);
const mockUseRevoke = vi.mocked(useRevokeDevice);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRevoke.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRevokeDevice>);
});

function setDevices(data: unknown) {
  mockUseDevices.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useDevices>);
}

describe("DeviceTable", () => {
  it("shows the EmptyState when there are no devices", () => {
    setDevices([]);
    render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
  });

  it("uses palette tones for each device state", () => {
    setDevices([
      { id: "1", label: "Enrolled one", role: "scanner", gate: "", enrolled_at: "2026-01-01" },
      { id: "2", label: "Pending one", role: "scanner", gate: "" },
      { id: "3", label: "Revoked one", role: "scanner", gate: "", revoked_at: "2026-01-02" },
    ]);
    render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("Enrolled").className).toContain("text-success");
    expect(screen.getByText("Pending enrollment").className).toContain("text-muted-foreground");
    expect(screen.getByText("Revoked").className).toContain("text-destructive");
  });

  it("shows a skeleton while loading", () => {
    mockUseDevices.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useDevices>);
    const { container } = render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeTruthy();
  });
});
