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
import { postEnroll, postUnlock } from "@/lib/scanner/api";
import { clearDevice, loadSession, saveDevice, useDeviceIdentity } from "@/lib/scanner/session";

const mockUseDevice = vi.mocked(useDeviceIdentity);
const mockLoadSession = vi.mocked(loadSession);
const mockPostUnlock = vi.mocked(postUnlock);
const mockPostEnroll = vi.mocked(postEnroll);
const mockClearDevice = vi.mocked(clearDevice);
const mockSaveDevice = vi.mocked(saveDevice);

const DEVICE = {
  device_id: "d1",
  device_token: "tok-dev",
  event_id: "e1",
  event_slug: "launch",
  org_slug: "byondr",
  label: "Gate A",
  role: "walkin_display" as const,
};

const ENROLL_RESULT = {
  device_id: "d2",
  device_token: "tok-new",
  event_id: "e2",
  event_slug: "other",
  event_name: "Other Event",
  org_slug: "byondr",
  label: "Gate B",
  role: "scanner" as const,
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

  it("shows the human event name in the warning card when present", () => {
    mockUseDevice.mockReturnValue({ ...DEVICE, event_name: "Launch Pilot" });
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    expect(screen.getByText("Launch Pilot")).toBeInTheDocument();
    expect(screen.queryByText("launch")).not.toBeInTheDocument();
  });

  it("falls back to the slug when no event_name is stored", () => {
    mockUseDevice.mockReturnValue(DEVICE); // DEVICE has event_slug "launch", no event_name
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    expect(screen.getByText("launch")).toBeInTheDocument();
  });

  it("requires the event PIN before overwriting an already-enrolled device", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    mockPostUnlock.mockResolvedValueOnce({} as never);
    mockPostEnroll.mockResolvedValueOnce(ENROLL_RESULT);
    render(<ScannerEnrollPage />);

    fireEvent.change(screen.getByPlaceholderText("Paste here"), { target: { value: "NEW-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: /Enroll device/ }));

    // It must NOT enroll immediately — a PIN confirmation appears first.
    expect(mockPostEnroll).not.toHaveBeenCalled();
    const pin = await screen.findByPlaceholderText("• • • •");
    fireEvent.change(pin, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm & enroll/ }));

    await waitFor(() => expect(mockPostUnlock).toHaveBeenCalledWith("tok-dev", "1234"));
    await waitFor(() => expect(mockPostEnroll).toHaveBeenCalledWith("NEW-CODE"));
    await waitFor(() => expect(mockSaveDevice).toHaveBeenCalledTimes(1));
  });

  it("does NOT overwrite when the confirmation PIN is wrong", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    mockPostUnlock.mockRejectedValueOnce(new Error("Incorrect PIN."));
    render(<ScannerEnrollPage />);

    fireEvent.change(screen.getByPlaceholderText("Paste here"), { target: { value: "NEW-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: /Enroll device/ }));
    fireEvent.change(await screen.findByPlaceholderText("• • • •"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm & enroll/ }));

    await waitFor(() => expect(screen.getByText("Incorrect PIN.")).toBeInTheDocument());
    expect(mockPostEnroll).not.toHaveBeenCalled();
  });

  it("enrolls directly without a PIN when no device is enrolled yet", async () => {
    mockUseDevice.mockReturnValue(null);
    mockPostEnroll.mockResolvedValueOnce(ENROLL_RESULT);
    render(<ScannerEnrollPage />);

    fireEvent.change(screen.getByPlaceholderText("Paste here"), { target: { value: "FRESH" } });
    fireEvent.click(screen.getByRole("button", { name: /Enroll device/ }));

    await waitFor(() => expect(mockPostEnroll).toHaveBeenCalledWith("FRESH"));
    expect(mockPostUnlock).not.toHaveBeenCalled();
  });

  it("recovers (no stuck state) when the code is invalid after the PIN verifies", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    mockPostUnlock.mockResolvedValueOnce({} as never);
    mockPostEnroll.mockRejectedValueOnce(new Error("Unknown or already-used enrollment code."));
    render(<ScannerEnrollPage />);

    fireEvent.change(screen.getByPlaceholderText("Paste here"), { target: { value: "BAD-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: /Enroll device/ }));
    fireEvent.change(await screen.findByPlaceholderText("• • • •"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm & enroll/ }));

    await waitFor(() =>
      expect(screen.getByText("Unknown or already-used enrollment code.")).toBeInTheDocument(),
    );
    // Form recovered: the "Enroll device" button is back (not stuck on "Verifying…").
    expect(screen.getByRole("button", { name: /Enroll device/ })).toBeInTheDocument();
  });

  it("opening reset cancels a pending overwrite prompt (only one PIN field)", async () => {
    mockUseDevice.mockReturnValue(DEVICE);
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);

    fireEvent.change(screen.getByPlaceholderText("Paste here"), { target: { value: "NEW-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: /Enroll device/ }));
    await screen.findByPlaceholderText("• • • •"); // overwrite prompt is open
    fireEvent.click(screen.getByRole("button", { name: /Reset & re-enroll/ }));

    expect(screen.getAllByPlaceholderText("• • • •")).toHaveLength(1);
  });
});
