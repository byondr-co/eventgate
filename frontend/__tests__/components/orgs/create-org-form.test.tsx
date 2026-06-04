import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/orgs", () => ({ useCreateOrg: vi.fn() }));
vi.mock("@/lib/api", () => ({
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
}));

import { CreateOrgForm } from "@/components/orgs/create-org-form";
import { useCreateOrg } from "@/lib/orgs";

const mockCreate = vi.mocked(useCreateOrg);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false } as never);
});

describe("CreateOrgForm", () => {
  it("labels the name field via Field", () => {
    render(<CreateOrgForm />);
    const input = screen.getByLabelText("Organization name");
    expect(input).toHaveAttribute("data-slot", "input");
  });
});
