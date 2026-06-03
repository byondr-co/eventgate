import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("renders with data-slot and forwards props", () => {
    render(<Input placeholder="Event name" aria-invalid />);
    const el = screen.getByPlaceholderText("Event name");
    expect(el).toHaveAttribute("data-slot", "input");
    expect(el).toHaveAttribute("aria-invalid", "true");
  });
});
