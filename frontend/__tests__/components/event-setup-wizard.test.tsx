import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/events", () => ({
  useCreateEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useTransitionEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { EventSetupWizard } from "@/components/wizard/event-setup-wizard";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("starts on Basics with a progress bar", () => {
  wrap(<EventSetupWizard orgSlug="acme" />);
  expect(screen.getByText(/set up your event/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
});
