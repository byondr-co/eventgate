import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HealthcheckCard } from "@/components/healthcheck-card";

describe("HealthcheckCard", () => {
  it("renders ok state", () => {
    render(<HealthcheckCard status="ok" database="ok" version="0.1.0" />);
    expect(screen.getByText(/Backend: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/Database: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
  });

  it("renders database error", () => {
    render(<HealthcheckCard status="ok" database="error" version="0.1.0" />);
    expect(screen.getByText(/Database: error/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(<HealthcheckCard loading />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });
});
