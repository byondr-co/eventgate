import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));

vi.mock("@/lib/auth", () => ({
  useMe: () => ({ data: { email: "current@x.com" } }),
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
});

describe("MembersTable", () => {
  it("renders members; owners show static label, non-owners get a role select", async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());
    expect(screen.getByText("staff@x.com")).toBeInTheDocument();

    // Owner row shows a static "Owner" span label (not inside a select)
    const ownerLabel = screen.getByText("Owner", { selector: "span" });
    expect(ownerLabel).toBeInTheDocument();

    // Non-owner rows get a select (no "owner" option); plus 1 invite form select
    const selects = screen.getAllByRole("combobox");
    // 1 staff row dropdown + 1 invite form dropdown = 2
    expect(selects.length).toBeGreaterThanOrEqual(2);
    // The staff member's dropdown should NOT have an "owner" option
    const staffSelect = selects.find(
      (s) =>
        !Array.from(s.querySelectorAll("option")).some(
          (o) => o.value === "owner" && o.textContent === "Owner",
        ) || s.closest("form") !== null,
    );
    // Confirm there is no owner option in the members table selects
    const memberSelects = selects.filter((s) => s.closest("form") === null);
    memberSelects.forEach((sel) => {
      expect(Array.from(sel.querySelectorAll("option")).map((o) => o.value)).not.toContain("owner");
    });
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

  it("opens ConfirmDialog and calls DELETE on Remove button click", async () => {
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

    // Dialog should now be open — scope the confirm click to the dialog element
    // so it is unambiguous even though the trigger button also matches /Remove/i
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove member?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining("/memberships/m1/"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("hides Remove button on the current user's own row", async () => {
    // current@x.com is the logged-in user (from useMe mock above)
    const dataWithCurrentUser = {
      count: 2,
      results: [
        {
          id: "m1",
          user_email: "current@x.com",
          user_full_name: "Me",
          role: "admin",
          is_active: true,
          accepted_at: "2024-01-01T00:00:00Z",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "m2",
          user_email: "other@x.com",
          user_full_name: "Other",
          role: "staff",
          is_active: true,
          accepted_at: "2024-01-02T00:00:00Z",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
    };
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes("/members/")) return Promise.resolve(dataWithCurrentUser);
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("current@x.com")).toBeInTheDocument());

    // Only one Remove button should appear (for other@x.com, not current@x.com)
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("shows the invite-success message in the success token color", async () => {
    mockApi.mockImplementation((url: string, opts?: { method?: string }) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/") && opts?.method === "POST")
        return Promise.resolve({ id: "i9", email: "new@x.com", role: "admin" });
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("teammate@example.com"), {
      target: { value: "new@x.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send invite/ }));
    const msg = await screen.findByText(/Invite sent to new@x.com/);
    expect(msg.className).toContain("text-success");
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
