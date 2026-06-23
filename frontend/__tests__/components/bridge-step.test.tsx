import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { BridgeIntro } from "@/components/wizard/steps/bridge-substeps";

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

it("intro explains the connection and has a start action", () => {
  render(<BridgeIntro onStart={() => {}} onBack={() => {}} pending={false} />);
  expect(screen.getByText(/connect your google form/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start|next|connect/i })).toBeInTheDocument();
});
