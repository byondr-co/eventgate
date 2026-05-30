import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong."),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { apiFetch } from "@/lib/api";
import { PublicUrlCard } from "@/components/events/public-url-card";

const mockApiFetch = vi.mocked(apiFetch);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PublicUrlCard", () => {
  it("renders the long URL with copy button", async () => {
    mockApiFetch.mockResolvedValue({ count: 0, results: [] });
    wrap(<PublicUrlCard orgSlug="my-org" eventSlug="my-event" />);
    expect(screen.getByText("Public registration link")).toBeInTheDocument();
    expect(screen.getByText(/\/e\/my-org\/my-event\/register/)).toBeInTheDocument();
  });

  it("renders short URL when data is available", async () => {
    mockApiFetch.mockResolvedValue({
      count: 1,
      results: [{ id: "1", short_code: "abc12345", target_url: "https://x.com", created_at: "" }],
    });
    const { findByText } = wrap(<PublicUrlCard orgSlug="my-org" eventSlug="my-event" />);
    // Wait for the short URL to appear
    expect(await findByText(/\/r\/abc12345/)).toBeInTheDocument();
  });
});
