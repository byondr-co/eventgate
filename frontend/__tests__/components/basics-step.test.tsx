import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useCreateEvent: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

import { BasicsStep } from "@/components/wizard/steps/basics-step";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders the four basics fields", () => {
  wrap(<BasicsStep orgSlug="acme" onCreated={() => {}} />);
  expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/url slug/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/venue/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/walk-in capacity/i)).toBeInTheDocument();
});
