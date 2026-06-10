import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch" }),
}));
vi.mock("@/lib/audit", () => ({ useAuditEvents: vi.fn() }));

import AuditPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page";
import { useAuditEvents } from "@/lib/audit";

const mockUseAuditEvents = vi.mocked(useAuditEvents);
type AuditQueryResult = ReturnType<typeof useAuditEvents>;

describe("AuditPage", () => {
  it("renders a table skeleton while loading", () => {
    mockUseAuditEvents.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as AuditQueryResult);
    render(<AuditPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("Loading…", { ignore: ".sr-only" })).toBeNull();
    expect(
      document.querySelector('[data-slot="card-title"] [data-slot="skeleton"]'),
    ).not.toBeNull();
  });

  it("renders the row count and table once loaded, with no skeleton", () => {
    mockUseAuditEvents.mockReturnValue({
      data: { count: 0, next: null, results: [] },
      isLoading: false,
    } as unknown as AuditQueryResult);
    render(<AuditPage />);
    expect(screen.getByText("0 rows")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
