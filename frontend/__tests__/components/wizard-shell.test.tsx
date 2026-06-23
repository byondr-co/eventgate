import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ChoiceCard } from "@/components/wizard/choice-card";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

it("ChoiceCard fires onSelect and reflects aria-checked", () => {
  const onSelect = vi.fn();
  render(<ChoiceCard selected title="Native" description="d" onSelect={onSelect} />);
  const card = screen.getByRole("radio");
  expect(card).toHaveAttribute("aria-checked", "true");
  fireEvent.click(card);
  expect(onSelect).toHaveBeenCalled();
});
