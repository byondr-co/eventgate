import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "@/components/ui/segmented-control";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "walkin", label: "Walk-in" },
];

describe("SegmentedControl", () => {
  it("marks the active option as pressed", () => {
    render(<SegmentedControl options={OPTIONS} value="all" onValueChange={() => {}} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Walk-in" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("fires onValueChange when another option is clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="all" onValueChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(onChange).toHaveBeenCalledWith("walkin");
  });

  it("renders a ReactNode label while keeping the accessible name from text", () => {
    render(
      <SegmentedControl
        options={[
          {
            value: "light",
            label: (
              <span>
                <span aria-hidden="true">☀</span> Light
              </span>
            ),
          },
          {
            value: "dark",
            label: (
              <span>
                <span aria-hidden="true">☾</span> Dark
              </span>
            ),
          },
        ]}
        value="light"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  });
});
