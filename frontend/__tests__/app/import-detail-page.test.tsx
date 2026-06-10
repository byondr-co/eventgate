import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch", id: "abc12345" }),
}));
vi.mock("@/lib/csv-imports", () => ({ useImportStatus: vi.fn() }));

import ImportDetailPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page";
import { useImportStatus } from "@/lib/csv-imports";

const mockUseImportStatus = vi.mocked(useImportStatus);
type ImportResult = ReturnType<typeof useImportStatus>;

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ImportDetailPage />
    </QueryClientProvider>,
  );
}

describe("ImportDetailPage", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseImportStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ImportResult);
    renderPage();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the import status once loaded, with no skeleton", () => {
    mockUseImportStatus.mockReturnValue({
      data: {
        id: "abc12345",
        status: "running",
        total_rows: 10,
        imported_rows: 5,
        failed_rows: 0,
        error_report_url: null,
        created_at: "2026-06-10T00:00:00Z",
        completed_at: null,
      },
      isLoading: false,
    } as unknown as ImportResult);
    renderPage();
    expect(screen.getByText("Import abc12345")).toBeInTheDocument();
    expect(screen.getByText(/Imported 5 \/ 10/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
