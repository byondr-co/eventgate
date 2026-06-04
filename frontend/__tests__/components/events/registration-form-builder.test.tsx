import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useFields: vi.fn(),
  useAddField: vi.fn(),
  useDeleteField: vi.fn(),
}));

import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";
import { useAddField, useDeleteField, useFields } from "@/lib/events";

const mockFields = vi.mocked(useFields);
const mockAdd = vi.mocked(useAddField);
const mockDelete = vi.mocked(useDeleteField);

beforeEach(() => {
  vi.clearAllMocks();
  mockFields.mockReturnValue({ data: { results: [] }, isLoading: false } as never);
  mockAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockDelete.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

describe("RegistrationFormBuilder add-field controls", () => {
  it("uses Input and Select primitives and a checkbox", () => {
    render(<RegistrationFormBuilder orgSlug="o" eventSlug="e" />);
    expect(screen.getByPlaceholderText("Label (English)")).toHaveAttribute("data-slot", "input");
    expect(screen.getByRole("combobox")).toHaveAttribute("data-slot", "select");
    expect(screen.getByRole("checkbox", { name: /Required/ })).toBeInTheDocument();
  });
});
