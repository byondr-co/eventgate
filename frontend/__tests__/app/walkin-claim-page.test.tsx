import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "o", eventSlug: "e", token: "tok-2" }),
}));

vi.mock("@/lib/walkins", () => ({
  useClaim: vi.fn(),
}));

import WalkinClaimPage from "@/app/(public)/e/[orgSlug]/[eventSlug]/claim/[token]/page";
import { markInfoCompleted, writeClaim } from "@/lib/walkin-device";
import { useClaim } from "@/lib/walkins";

const mockUseClaim = vi.mocked(useClaim);

beforeEach(() => {
  localStorage.clear();
  mockUseClaim.mockReset();
});

function setClaim(over: Record<string, unknown> = {}) {
  mockUseClaim.mockReturnValue({
    data: { info_form_url: "/e/o/e/info/tok-2/" },
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  } as unknown as ReturnType<typeof useClaim>);
}

describe("WalkinClaimPage re-scan guard", () => {
  it("blocks a different-token scan after this device already claimed the event", async () => {
    writeClaim("o", "e", "tok-1"); // prior claim of a different token
    setClaim();
    render(<WalkinClaimPage />);
    await waitFor(() => expect(screen.getByText("Already checked in")).toBeInTheDocument());
    // The claim query must be disabled when blocked.
    const lastCall = mockUseClaim.mock.calls.at(-1)!;
    expect(lastCall[3]).toMatchObject({ enabled: false });
  });

  it("allows the claim and shows confirmation when no prior claim exists", async () => {
    setClaim();
    render(<WalkinClaimPage />);
    await waitFor(() => expect(screen.getByText("ENTRY CONFIRMED")).toBeInTheDocument());
    const lastCall = mockUseClaim.mock.calls.at(-1)!;
    expect(lastCall[3]).toMatchObject({ enabled: true });
  });

  it("offers Complete my info on a blocked re-scan when info isn't finished", async () => {
    writeClaim("o", "e", "tok-1"); // claimed, info not completed
    setClaim();
    render(<WalkinClaimPage />);
    await waitFor(() => expect(screen.getByText("Already checked in")).toBeInTheDocument());
    const link = screen.getByRole("link", { name: /Complete my info/ });
    // Next normalizes the trailing slash off the rendered anchor; the route resolves either way.
    expect(link.getAttribute("href")).toMatch(/^\/e\/o\/e\/info\/tok-1\/?$/);
  });

  it("hides Complete my info once info is finished", async () => {
    markInfoCompleted("o", "e", "tok-1");
    setClaim();
    render(<WalkinClaimPage />);
    await waitFor(() => expect(screen.getByText("Already checked in")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Complete my info/ })).not.toBeInTheDocument();
  });

  it("allows re-showing confirmation for the SAME token (idempotent)", async () => {
    writeClaim("o", "e", "tok-2"); // same token this page is claiming
    setClaim();
    render(<WalkinClaimPage />);
    await waitFor(() => expect(screen.getByText("ENTRY CONFIRMED")).toBeInTheDocument());
    expect(screen.queryByText("Already checked in")).not.toBeInTheDocument();
  });
});
