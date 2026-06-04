import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/events", () => ({ useCreateEvent: vi.fn() }));

import { EventCreateWizard } from "@/components/events/event-create-wizard";
import { useCreateEvent } from "@/lib/events";

const mockCreate = vi.mocked(useCreateEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("EventCreateWizard", () => {
  it("labels its fields via Field", () => {
    render(<EventCreateWizard orgSlug="o" />);
    expect(screen.getByLabelText("Event name")).toBeInTheDocument();
    expect(screen.getByLabelText("URL slug")).toBeInTheDocument();
    expect(screen.getByLabelText(/Venue/)).toBeInTheDocument();
    expect(screen.getByLabelText("Walk-in capacity")).toBeInTheDocument();
  });
});
