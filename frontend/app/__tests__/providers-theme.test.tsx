import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "next-themes";

import { Providers } from "@/app/providers";

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
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

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
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
