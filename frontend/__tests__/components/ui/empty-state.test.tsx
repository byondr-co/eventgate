import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";
import { NoDevices } from "@/lib/illustrations";

describe("EmptyState", () => {
  it("renders illustration, title, message and action", () => {
    render(
      <EmptyState
        illustration={NoDevices}
        title="No devices yet"
        message="Enroll the first phone at your door."
        action={<button>Enroll a device</button>}
      />,
    );
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
    expect(screen.getByText("Enroll the first phone at your door.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enroll a device" })).toBeInTheDocument();
  });
});
