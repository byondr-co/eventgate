import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { RegistrationSuccess } from "@/components/guests/registration-success";

describe("RegistrationSuccess", () => {
  it("renders a confirmation illustration and the title", () => {
    const { container } = render(<RegistrationSuccess />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("success_title")).toBeInTheDocument();
  });
});
