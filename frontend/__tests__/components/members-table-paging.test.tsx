import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/orgs", () => ({
  useMembers: () => ({
    data: {
      count: 1,
      results: [{ id: "m1", user_email: "a@x.com", role: "admin", accepted_at: "2026-06-01" }],
    },
    isLoading: false,
  }),
  usePendingInvites: () => ({ data: { count: 0, results: [] } }),
  useSendInvite: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useUpdateMembership: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRemoveMembership: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useCancelInvite: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("@/lib/auth", () => ({
  useMe: () => ({ data: { email: "owner@x.com" } }),
}));

import { MembersTable } from "@/components/orgs/members-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows pagination controls", () => {
  wrap(<MembersTable slug="acme" />);
  expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  expect(screen.getByText(/rows per page/i)).toBeInTheDocument();
});
