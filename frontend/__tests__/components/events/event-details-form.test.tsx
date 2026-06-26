// frontend/__tests__/components/event-details-form.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/events", () => ({
  useEvent: () => ({
    data: {
      id: "1",
      name: "Launch",
      slug: "launch",
      status: "draft",
      starts_at: null,
      ends_at: null,
      timezone: "Asia/Phnom_Penh",
      venue: "",
      registration_open: true,
      walkins_enabled: true,
      walkin_capacity: 0,
      created_at: "",
      description: "",
      banner_image: null,
    },
    isLoading: false,
  }),
  useUpdateEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EventDetailsForm } from "@/components/events/event-details-form";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders the editable event fields prefilled", () => {
  wrap(<EventDetailsForm orgSlug="acme" eventSlug="launch" />);
  expect((screen.getByLabelText(/event name/i) as HTMLInputElement).value).toBe("Launch");
  expect((screen.getByLabelText(/url slug/i) as HTMLInputElement).value).toBe("launch");
  expect(screen.getByLabelText(/venue/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
});
