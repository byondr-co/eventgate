import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useEvent: vi.fn(),
  useUpdateEvent: vi.fn(),
  useUploadBanner: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { EventPresentationEditor } from "@/components/events/event-presentation-editor";
import { useEvent, useUpdateEvent, useUploadBanner } from "@/lib/events";

const mockEvent = vi.mocked(useEvent);
const mockUpdate = vi.mocked(useUpdateEvent);
const mockUpload = vi.mocked(useUploadBanner);

beforeEach(() => {
  vi.clearAllMocks();
  mockEvent.mockReturnValue({ data: { description: "", banner_image: null } } as never);
  mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockUpload.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("EventPresentationEditor", () => {
  it("renders the description via a Textarea labeled through Field", () => {
    render(<EventPresentationEditor orgSlug="o" eventSlug="e" />);
    const ta = screen.getByLabelText("Description");
    expect(ta).toHaveAttribute("data-slot", "textarea");
  });
});
