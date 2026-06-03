import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Slider } from "@/components/ui/slider";

describe("Slider", () => {
  it("renders a range input with the given value and bounds", () => {
    render(
      <Slider
        aria-label="Temperature"
        min={0}
        max={2}
        step={0.01}
        value={1}
        onValueChange={() => {}}
      />,
    );
    const el = screen.getByLabelText("Temperature") as HTMLInputElement;
    expect(el).toHaveAttribute("type", "range");
    expect(el.value).toBe("1");
    expect(el).toHaveAttribute("max", "2");
  });
});
