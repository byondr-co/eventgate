import { render } from "@testing-library/react";
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
});
