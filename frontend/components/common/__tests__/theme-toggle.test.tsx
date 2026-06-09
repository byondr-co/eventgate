import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { useTheme } from "next-themes";

vi.mock("next-themes", () => ({ useTheme: vi.fn() }));

const setTheme = vi.fn();
const mockedUseTheme = vi.mocked(useTheme);

function mockTheme(overrides: Partial<ReturnType<typeof useTheme>> = {}) {
  mockedUseTheme.mockReturnValue({
    theme: "system",
    resolvedTheme: "dark",
    setTheme,
    themes: ["light", "dark", "system"],
    ...overrides,
  } as ReturnType<typeof useTheme>);
}

import { ThemeToggle } from "@/components/common/theme-toggle";

beforeEach(() => {
  setTheme.mockClear();
  mockTheme();
});

describe("ThemeToggle", () => {
  it("renders three labelled options after mount and is axe-clean", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await screen.findByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls setTheme when an option is chosen", async () => {
    render(<ThemeToggle />);
    fireEvent.click(await screen.findByRole("button", { name: /dark/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("renders an aria-hidden placeholder (no buttons) before the theme resolves", () => {
    mockTheme({ theme: undefined, resolvedTheme: undefined, themes: [] });
    const { container } = render(<ThemeToggle />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
