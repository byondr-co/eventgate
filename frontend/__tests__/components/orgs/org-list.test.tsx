import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orgs", () => ({ useOrgs: vi.fn() }));

import { OrgList } from "@/components/orgs/org-list";
import { useOrgs } from "@/lib/orgs";

const mockUseOrgs = vi.mocked(useOrgs);
type OrgsResult = ReturnType<typeof useOrgs>;

describe("OrgList", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseOrgs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as OrgsResult);
    render(<OrgList />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders org cards once loaded, with no skeleton", () => {
    mockUseOrgs.mockReturnValue({
      data: { count: 1, results: [{ id: "1", name: "Acme", slug: "acme", role: "owner" }] },
      isLoading: false,
      isError: false,
    } as unknown as OrgsResult);
    render(<OrgList />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
