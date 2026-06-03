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

  it("wires aria-invalid and aria-describedby onto the child control when errored", () => {
    render(
      <Field label="Label" error="Required" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
  });

  it("does not mark the child invalid when there is no error", () => {
    render(
      <Field label="Label" helper="Helper text" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("merges the error id with an aria-describedby the consumer already set", () => {
    render(
      <Field label="Label" error="Required" htmlFor="email">
        <input id="email" aria-describedby="hint" />
      </Field>,
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-describedby", "hint email-error");
  });

  it("does not crash when children is not a single element", () => {
    render(
      <Field label="Label" error="Required">
        plain text
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});
