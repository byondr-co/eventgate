import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { RegistrationStep } from "@/components/wizard/steps/registration-step";

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

it("offers native + google and reports changes", () => {
  const onChange = vi.fn();
  render(
    <RegistrationStep value="native" onChange={onChange} onNext={() => {}} onBack={() => {}} />,
  );
  expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Google Form"));
  expect(onChange).toHaveBeenCalledWith("google");
});
