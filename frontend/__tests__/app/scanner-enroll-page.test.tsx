import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/scanner/api", () => ({
  postEnroll: vi.fn(),
  postUnlock: vi.fn(),
}));

vi.mock("@/lib/scanner/session", () => ({
  useDeviceIdentity: vi.fn(),
  saveDevice: vi.fn(),
  clearDevice: vi.fn(),
  loadSession: vi.fn(),
}));

import ScannerEnrollPage from "@/app/scanner/enroll/page";
import { postUnlock } from "@/lib/scanner/api";
import { clearDevice, loadSession, useDeviceIdentity } from "@/lib/scanner/session";

const mockUseDevice = vi.mocked(useDeviceIdentity);
const mockLoadSession = vi.mocked(loadSession);
const mockPostUnlock = vi.mocked(postUnlock);
const mockClearDevice = vi.mocked(clearDevice);

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

describe("ScannerEnrollPage already-enrolled actions", () => {
  it("offers a role-aware resume link straight to the working screen when unlocked", () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue({ session_token: "s", expires_at: "2999-01-01" });
    render(<ScannerEnrollPage />);
    fireEvent.click(screen.getByRole("button", { name: /Open Walk-in display/ }));
    expect(replace).toHaveBeenCalledWith("/scanner/walkin");
  });

  it("routes resume through unlock when no session is active", () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    fireEvent.click(screen.getByRole("button", { name: /Open Walk-in display/ }));
    expect(replace).toHaveBeenCalledWith("/scanner/unlock");
  });

  it("requires a correct PIN before resetting the device", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    mockPostUnlock.mockResolvedValueOnce({} as never);
    render(<ScannerEnrollPage />);

    fireEvent.click(screen.getByRole("button", { name: /Reset & re-enroll/ }));
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm reset/ }));

    await waitFor(() => expect(mockPostUnlock).toHaveBeenCalledWith("tok-dev", "1234"));
    await waitFor(() => expect(mockClearDevice).toHaveBeenCalledTimes(1));
  });

  it("does NOT reset when the PIN is wrong", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    mockPostUnlock.mockRejectedValueOnce(new Error("Incorrect PIN."));
    render(<ScannerEnrollPage />);

    fireEvent.click(screen.getByRole("button", { name: /Reset & re-enroll/ }));
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm reset/ }));

    await waitFor(() => expect(screen.getByText("Incorrect PIN.")).toBeInTheDocument());
    expect(mockClearDevice).not.toHaveBeenCalled();
  });
});
