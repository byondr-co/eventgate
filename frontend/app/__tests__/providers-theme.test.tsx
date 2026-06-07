import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useTheme } from "next-themes";

import { Providers } from "@/app/providers";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
});

function ThemeProbe() {
  const { themes } = useTheme();
  return <span data-testid="themes">{themes.join(",")}</span>;
}

describe("Providers theme integration", () => {
  it("provides next-themes context to children", () => {
    render(
      <Providers>
        <ThemeProbe />
      </Providers>,
    );
    expect(screen.getByTestId("themes").textContent).toContain("dark");
    expect(screen.getByTestId("themes").textContent).toContain("light");
    expect(screen.getByTestId("themes").textContent).toContain("system");
  });
});
