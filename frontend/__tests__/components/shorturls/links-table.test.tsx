import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shorturls", () => ({
  useShortUrls: vi.fn(),
  useCreateShortUrl: vi.fn(),
  useUpdateShortUrl: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { LinksTable } from "@/components/shorturls/links-table";
import { useCreateShortUrl, useShortUrls, useUpdateShortUrl } from "@/lib/shorturls";

const mockLinks = vi.mocked(useShortUrls);
const mockCreate = vi.mocked(useCreateShortUrl);
const mockUpdate = vi.mocked(useUpdateShortUrl);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockUpdate.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

describe("LinksTable", () => {
  it("uses the Input primitive for the create-row note field", () => {
    mockLinks.mockReturnValue({ data: { count: 0, results: [] }, isLoading: false } as never);
    render(<LinksTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByPlaceholderText("Label (e.g. Instagram bio)")).toHaveAttribute(
      "data-slot",
      "input",
    );
  });

  it("shows the EmptyState when there are no links", () => {
    mockLinks.mockReturnValue({ data: { count: 0, results: [] }, isLoading: false } as never);
    render(<LinksTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("No links yet")).toBeInTheDocument();
  });
});
