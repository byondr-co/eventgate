import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
  API_BASE: "",
}));

import { apiFetch } from "@/lib/api";
import { useUpdateMembership, useRemoveMembership, useSendInvite } from "@/lib/orgs";

const mockApi = vi.mocked(apiFetch);
const SLUG = "acme";

function makeClientAndSpy() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("orgs mutation cache invalidation", () => {
  it("useUpdateMembership invalidates the members query key used by useMembers", async () => {
    mockApi.mockResolvedValue({});
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useUpdateMembership(SLUG), { wrapper });
    await result.current.mutateAsync({ membershipId: "m1", role: "manager" });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["orgs", SLUG, "members"] }));
  });

  it("useRemoveMembership invalidates the members query key", async () => {
    mockApi.mockResolvedValue(undefined);
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useRemoveMembership(SLUG), { wrapper });
    await result.current.mutateAsync("m1");
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["orgs", SLUG, "members"] }));
  });

  it("useSendInvite invalidates the pending-invites query key used by usePendingInvites", async () => {
    mockApi.mockResolvedValue({});
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useSendInvite(SLUG), { wrapper });
    await result.current.mutateAsync({ email: "x@y.com", role: "staff" });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["invites", SLUG] }));
  });
});
