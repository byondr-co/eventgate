import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
}));

import { apiFetch } from "@/lib/api";
import { OrgNameEditor } from "@/components/orgs/org-name-editor";

const mockApi = vi.mocked(apiFetch);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("OrgNameEditor", () => {
  it("renders the name as a heading by default", () => {
    wrap(<OrgNameEditor orgSlug="acme" name="Acme Inc" />);
    expect(screen.getByRole("heading", { name: /Acme Inc/i })).toBeInTheDocument();
  });

  it("swaps to input on pencil click and saves on Enter", async () => {
    mockApi.mockResolvedValue({ name: "New Name", slug: "acme" });
    wrap(<OrgNameEditor orgSlug="acme" name="Old Name" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/orgs/acme/",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "New Name" }) }),
      ),
    );
  });

  it("cancels on Escape (no mutation)", async () => {
    wrap(<OrgNameEditor orgSlug="acme" name="Old Name" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Half-typed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockApi).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Old Name/i })).toBeInTheDocument();
  });

  it("displays mutation error inline", async () => {
    mockApi.mockRejectedValue(new Error("400 Bad Request: bad name"));
    wrap(<OrgNameEditor orgSlug="acme" name="Old" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/bad name/i)).toBeInTheDocument());
  });
});
