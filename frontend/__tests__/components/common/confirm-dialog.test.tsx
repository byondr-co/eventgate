import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders trigger and shows title/description when opened", () => {
    render(
      <ConfirmDialog
        trigger={<button>Remove</button>}
        title="Remove member?"
        description="This cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Remove member?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
