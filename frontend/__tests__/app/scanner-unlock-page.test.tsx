import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/scanner/api", () => ({
  postUnlock: vi.fn(),
}));

vi.mock("@/lib/scanner/guest-cache", () => ({
  primeGuestCache: vi.fn(),
}));

vi.mock("@/lib/scanner/session", () => ({
  useDeviceIdentity: vi.fn(),
  saveSession: vi.fn(),
  clearDevice: vi.fn(),
}));

import ScannerUnlockPage from "@/app/scanner/unlock/page";
import { useDeviceIdentity } from "@/lib/scanner/session";

const mockUseDevice = vi.mocked(useDeviceIdentity);

const DEVICE = {
  device_id: "d1",
  device_token: "tok-dev",
  event_id: "e1",
  event_slug: "launch",
  org_slug: "byondr",
  label: "Gate A",
  role: "walkin_display" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScannerUnlockPage device card", () => {
  it("shows the human event name when present", () => {
    mockUseDevice.mockReturnValue({ ...DEVICE, event_name: "Launch Pilot" });
    render(<ScannerUnlockPage />);
    expect(screen.getByText("Launch Pilot")).toBeInTheDocument();
  });

  it("falls back to the slug when no event_name is stored", () => {
    mockUseDevice.mockReturnValue(DEVICE);
    render(<ScannerUnlockPage />);
    expect(screen.getByText("launch")).toBeInTheDocument();
  });
});
