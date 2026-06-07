import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("renders a pulsing muted placeholder and merges className", () => {
    render(<Skeleton className="h-8 w-full" data-testid="sk" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveAttribute("data-slot", "skeleton");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-muted");
    expect(el.className).toContain("h-8");
  });
});
