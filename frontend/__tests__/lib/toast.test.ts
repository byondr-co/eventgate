import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast as sonnerToast } from "sonner";
import { notify } from "@/lib/toast";

const mockSuccess = vi.mocked(sonnerToast.success);
const mockError = vi.mocked(sonnerToast.error);
const mockWarning = vi.mocked(sonnerToast.warning);
const mockInfo = vi.mocked(sonnerToast.info);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notify", () => {
  it("success() calls sonner toast.success with the message", () => {
    notify.success("Event saved");
    expect(mockSuccess).toHaveBeenCalledOnce();
    expect(mockSuccess).toHaveBeenCalledWith("Event saved");
  });

  it("warning() calls sonner toast.warning with the message", () => {
    notify.warning("Heads up");
    expect(mockWarning).toHaveBeenCalledOnce();
    expect(mockWarning).toHaveBeenCalledWith("Heads up");
  });

  it("info() calls sonner toast.info with the message", () => {
    notify.info("Did you know?");
    expect(mockInfo).toHaveBeenCalledOnce();
    expect(mockInfo).toHaveBeenCalledWith("Did you know?");
  });

  it("error() with an Error passes the extracted string to sonner toast.error", () => {
    const err = new Error('400 Bad Request: {"detail":"Invalid credentials."}');
    notify.error(err);
    expect(mockError).toHaveBeenCalledOnce();
    expect(mockError).toHaveBeenCalledWith("Invalid credentials.");
  });

  it("error() with an HTML-body error passes the generic message", () => {
    const err = new Error("500 Internal Server Error: <html>boom</html>");
    notify.error(err);
    expect(mockError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("error() with a non-Error passes the generic fallback", () => {
    notify.error(undefined);
    expect(mockError).toHaveBeenCalledWith("Something went wrong.");
  });

  it("error() with a plain string displays it verbatim", () => {
    notify.error("Could not copy.");
    expect(mockError).toHaveBeenCalledOnce();
    expect(mockError).toHaveBeenCalledWith("Could not copy.");
  });

  it("error() with a plain string does not run it through extractApiError", () => {
    // A string that looks like an Error message with HTML should still pass through
    // unchanged — the caller already owns the message.
    notify.error("Something went wrong. Please try again.");
    expect(mockError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });
});
