import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { IllustrationSuccess } from "@/components/illustrations";

it("renders an svg marked aria-hidden", () => {
  const { container } = render(<IllustrationSuccess />);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg).toHaveAttribute("aria-hidden");
});
