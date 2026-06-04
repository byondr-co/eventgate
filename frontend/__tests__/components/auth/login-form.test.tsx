import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ useRequestMagicLink: vi.fn() }));

import { LoginForm } from "@/components/auth/login-form";
import { useRequestMagicLink } from "@/lib/auth";

const mockReq = vi.mocked(useRequestMagicLink);

beforeEach(() => {
  vi.clearAllMocks();
  mockReq.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("LoginForm", () => {
  it("labels the email field via Field", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("data-slot", "input");
  });
});
