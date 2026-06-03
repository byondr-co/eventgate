import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button pill size", () => {
  it("applies the pill size classes", () => {
    render(<Button size="pill">Files</Button>);
    expect(screen.getByRole("button", { name: "Files" }).className).toContain("rounded-full");
  });
});
