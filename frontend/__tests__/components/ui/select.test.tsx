import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Select } from "@/components/ui/select";

describe("Select", () => {
  it("renders options and forwards value", () => {
    render(
      <Select aria-label="Role" defaultValue="b">
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </Select>,
    );
    const el = screen.getByLabelText("Role") as HTMLSelectElement;
    expect(el).toHaveAttribute("data-slot", "select");
    expect(el.value).toBe("b");
  });
});
