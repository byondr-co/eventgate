import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { CopyButton } from "@/components/events/copy-button";

describe("CopyButton", () => {
  it("calls clipboard.writeText with provided text and shows success toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CopyButton text="https://example.com/x" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("https://example.com/x");
    await Promise.resolve();
    expect(toast.success).toHaveBeenCalled();
  });
});
