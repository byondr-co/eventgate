// frontend/__tests__/components/event-danger-zone.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const deleteMock = vi.fn();
vi.mock("@/lib/events", () => ({
  useDeleteEvent: () => ({ mutateAsync: deleteMock, isPending: false }),
}));
vi.mock("@/lib/guests", () => ({ useGuestsCount: () => ({ data: 3 }) }));

import { EventDangerZone } from "@/components/events/event-danger-zone";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("disables delete when the event has guests", () => {
  wrap(<EventDangerZone orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /delete event/i })).toBeDisabled();
  expect(screen.getByText(/archive it instead/i)).toBeInTheDocument();
});
