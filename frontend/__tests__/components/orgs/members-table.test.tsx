import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));

import { apiFetch } from "@/lib/api";
import { MembersTable } from "@/components/orgs/members-table";

const mockApi = vi.mocked(apiFetch);

const MEMBERS_DATA = {
  count: 2,
  results: [
    {
      id: "m1",
      user_email: "owner@x.com",
      user_full_name: "Owner",
      role: "owner",
      is_active: true,
      accepted_at: "2024-01-01T00:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "m2",
      user_email: "staff@x.com",
      user_full_name: "Staff",
      role: "staff",
      is_active: true,
      accepted_at: "2024-01-02T00:00:00Z",
      created_at: "2024-01-02T00:00:00Z",
    },
  ],
};

const INVITES_DATA = {
  count: 1,
  results: [
    {
      id: "i1",
      email: "invited@x.com",
      role: "admin",
      created_at: "2024-01-03T00:00:00Z",
      expires_at: "2024-01-06T00:00:00Z",
      accepted_at: null,
    },
  ],
};

const EMPTY_INVITES = { count: 0, results: [] };

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
});

describe("MembersTable", () => {
  it("renders members and role dropdowns", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());
    expect(screen.getByText("staff@x.com")).toBeInTheDocument();

    // Each member row should have a role select
    const selects = screen.getAllByRole("combobox");
    // 2 member role dropdowns + 1 invite role dropdown in the invite form
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it("shows pending invites section when count > 0", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/")) return Promise.resolve(INVITES_DATA);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText(/Pending invites/i)).toBeInTheDocument());
    expect(screen.getByText("invited@x.com")).toBeInTheDocument();
  });

  it("hides pending invites section when count = 0", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());
    expect(screen.queryByText(/Pending invites/i)).not.toBeInTheDocument();
  });

  it("calls confirm + DELETE on Remove button click", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      if (String(url).includes("/memberships/")) return Promise.resolve(undefined);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    fireEvent.click(removeButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Remove owner@x.com"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining("/memberships/m1/"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("calls cancel invite on Cancel button click", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/") && !String(url).match(/\/invites\/[^/]+\//))
        return Promise.resolve(INVITES_DATA);
      if (String(url).includes("/invites/i1/")) return Promise.resolve(undefined);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("invited@x.com")).toBeInTheDocument());

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining("/invites/i1/"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
