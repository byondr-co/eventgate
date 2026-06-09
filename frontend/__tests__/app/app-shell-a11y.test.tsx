import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    themes: ["light", "dark", "system"],
  }),
}));
vi.mock("@/lib/auth", () => ({
  useMe: () => ({ data: { email: "a@b.co" } }),
  useLogout: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/auth-refresh", () => ({
  SessionRefreshProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import AppLayout from "@/app/(app)/layout";

describe("app shell a11y", () => {
  it("renders a skip-to-content link targeting #main", () => {
    render(
      <AppLayout>
        <div>content</div>
      </AppLayout>,
    );
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip).toHaveAttribute("href", "#main");
    // The target landmark must exist and be focusable for the skip link to work.
    const main = document.getElementById("main");
    expect(main?.tagName).toBe("MAIN");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("renders the theme toggle", () => {
    render(
      <AppLayout>
        <div>content</div>
      </AppLayout>,
    );
    expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
  });
});
