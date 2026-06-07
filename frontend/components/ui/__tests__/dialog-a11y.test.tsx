import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm</DialogTitle>
          <DialogDescription>Are you sure?</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog a11y", () => {
  it("opens with an accessible name and is axe-clean", async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Confirm");
    // Scope axe to the dialog popup: it scans the real content (title, description,
    // close button) but excludes Base UI's focus-guard sentinels, which are siblings
    // of the popup (not our markup) and intentionally carry no accessible name.
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("closes on Escape", async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
