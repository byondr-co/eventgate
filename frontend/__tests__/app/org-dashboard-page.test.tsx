import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "acme" }) }));
vi.mock("@/lib/orgs", () => ({ useOrg: vi.fn() }));
vi.mock("@/components/orgs/org-name-editor", () => ({
  OrgNameEditor: ({ name }: { name: string }) => <div>{name}</div>,
}));
vi.mock("@/components/events/events-table", () => ({
  EventsTable: () => <div data-testid="events-table" />,
}));

import OrgDashboardPage from "@/app/(app)/orgs/[slug]/page";
import { useOrg } from "@/lib/orgs";

const mockUseOrg = vi.mocked(useOrg);
type OrgResult = ReturnType<typeof useOrg>;

describe("OrgDashboardPage", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseOrg.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as OrgResult);
    render(<OrgDashboardPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the dashboard once loaded, with no skeleton", () => {
    mockUseOrg.mockReturnValue({
      data: { id: "1", name: "Acme", slug: "acme", role: "owner" },
      isLoading: false,
      isError: false,
    } as unknown as OrgResult);
    render(<OrgDashboardPage />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByTestId("events-table")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
