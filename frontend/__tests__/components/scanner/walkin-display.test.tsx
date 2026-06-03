import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalkinDisplay } from "@/components/scanner/walkin-display";

describe("WalkinDisplay — ready", () => {
  it("shows event title, purpose tag, enlarged counter with caption, and station label", () => {
    render(
      <WalkinDisplay
        claimUrl="https://example.test/claim/abc"
        scanner="Gate A"
        eventName="Launch Pilot"
        walkinCount={42}
        walkinCapacity={200}
      />,
    );
    expect(screen.getByText("Launch Pilot")).toBeInTheDocument();
    expect(screen.getByText(/Walk-in registration/)).toBeInTheDocument();
    expect(screen.getByText("42 / 200")).toBeInTheDocument();
    expect(screen.getByText("Walk-ins registered")).toBeInTheDocument();
    expect(screen.getByText(/Gate A/)).toBeInTheDocument();
  });

  it("omits the counter when no capacity is configured", () => {
    render(
      <WalkinDisplay claimUrl="https://example.test/claim/abc" scanner="Gate A" eventName="E" />,
    );
    expect(screen.queryByText("Walk-ins registered")).not.toBeInTheDocument();
  });
});

describe("WalkinDisplay — full", () => {
  it("renders the stop state with the count and station label", () => {
    render(
      <WalkinDisplay
        kind="full"
        scanner="Gate A"
        eventName="Launch Pilot"
        walkinCount={200}
        walkinCapacity={200}
      />,
    );
    expect(screen.getByText("Walk-ins are full")).toBeInTheDocument();
    expect(screen.getByText("200 / 200")).toBeInTheDocument();
    expect(screen.getByText(/Gate A/)).toBeInTheDocument();
  });
});
