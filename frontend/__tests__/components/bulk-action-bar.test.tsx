import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/guests", () => ({
  useBulkGuests: () => ({ mutateAsync: vi.fn(), isPending: false }),
  exportGuestsCsv: vi.fn(),
}));

import { BulkActionBar } from "@/components/guests/bulk-action-bar";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows the selected count and bulk actions", () => {
  wrap(
    <BulkActionBar orgSlug="acme" eventSlug="launch" selectedIds={["a", "b"]} onDone={() => {}} />,
  );
  expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^void$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /resend qr/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export selected/i })).toBeInTheDocument();
});
