import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Toggle } from "@/components/ui/toggle";

describe("Toggle", () => {
  it("exposes switch role and reflects checked state", () => {
    render(<Toggle checked aria-label="File search" onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "File search" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange with the toggled value", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} aria-label="PIN" onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "PIN" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
