import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StepTransition, SuccessBurst } from "@/components/motion";

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

describe("motion primitives", () => {
  it("renders children", () => {
    render(
      <StepTransition stepKey="a">
        <p>hello</p>
      </StepTransition>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("SuccessBurst renders its label", () => {
    render(<SuccessBurst label="You're live" />);
    expect(screen.getByText("You're live")).toBeInTheDocument();
  });
});
