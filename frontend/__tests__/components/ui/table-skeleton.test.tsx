import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TableSkeleton } from "@/components/ui/table-skeleton";

describe("TableSkeleton", () => {
  it("renders 5 skeleton rows by default", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeTruthy();
  });

  it("renders a custom row count", () => {
    const { container } = render(<TableSkeleton rows={3} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it("announces loading to screen readers", () => {
    render(<TableSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("hides the visual rows from assistive tech", () => {
    render(<TableSkeleton rows={3} />);
    const hidden = screen.getByRole("status").querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
