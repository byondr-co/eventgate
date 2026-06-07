import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "@/components/ui/button";

describe("a11y harness", () => {
  it("reports no axe violations for a labelled Button", async () => {
    const { container } = render(<Button>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
