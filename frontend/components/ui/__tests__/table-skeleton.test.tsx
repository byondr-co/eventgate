import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TableSkeleton } from "@/components/ui/table-skeleton";

describe("TableSkeleton", () => {
  it("announces loading to screen readers", () => {
    render(<TableSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("hides the visual rows from assistive tech", () => {
    render(<TableSkeleton rows={3} />);
    const hidden = screen.getByRole("status").querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden!.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
