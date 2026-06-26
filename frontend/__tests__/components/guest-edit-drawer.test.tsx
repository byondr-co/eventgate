// frontend/__tests__/components/guest-edit-drawer.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/guests", () => ({
  useUpdateGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendQrEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/events", () => ({ useFields: () => ({ data: { results: [] } }) }));

import { GuestEditDrawer } from "@/components/guests/guest-edit-drawer";

const guest = {
  id: "g1",
  guest_type: "pre_registered" as const,
  entry_status: "registered_not_arrived",
  info_status: "info_completed",
  full_name: "Ana",
  email: "ana@x.com",
  phone_or_chat: "",
  custom_fields: {},
  source: "",
  checked_in_at: null,
  created_at: "",
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows the editable guest fields + actions when open", () => {
  wrap(<GuestEditDrawer orgSlug="acme" eventSlug="launch" guest={guest} open onClose={() => {}} />);
  expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe("Ana");
  expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /void/i })).toBeInTheDocument();
});
