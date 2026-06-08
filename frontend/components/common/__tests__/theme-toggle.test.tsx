import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "dark",
    setTheme,
    themes: ["light", "dark", "system"],
  }),
}));

import { ThemeToggle } from "@/components/common/theme-toggle";

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
});
