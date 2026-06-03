import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/ui/field";

describe("Field", () => {
  it("renders label and helper text", () => {
    render(
      <Field label="Label" helper="Helper text" htmlFor="x">
        <input id="x" />
      </Field>,
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Helper text")).toBeInTheDocument();
  });

  it("shows an inline error with role=alert and hides helper when errored", () => {
    render(
      <Field label="Label" helper="Helper text" error="Required" htmlFor="x">
        <input id="x" />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Required");
    expect(screen.queryByText("Helper text")).not.toBeInTheDocument();
  });
});
