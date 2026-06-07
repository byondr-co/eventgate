import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

async function expectClean(ui: React.ReactElement) {
  const { container } = render(ui);
  expect(await axe(container)).toHaveNoViolations();
}

describe("primitive a11y", () => {
  // ── Field + Input ─────────────────────────────────────────────────────────
  it("Field + Input has an associated label", async () => {
    await expectClean(
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" />
      </Field>,
    );
  });

  // ── Field + Textarea ──────────────────────────────────────────────────────
  it("Field + Textarea has an associated label", async () => {
    await expectClean(
      <Field label="Bio" htmlFor="bio">
        <Textarea id="bio" name="bio" />
      </Field>,
    );
  });

  // ── Field + Select ────────────────────────────────────────────────────────
  it("Field + Select has an associated label", async () => {
    await expectClean(
      <Field label="Country" htmlFor="country">
        <Select id="country" name="country">
          <option value="kh">Cambodia</option>
          <option value="us">United States</option>
        </Select>
      </Field>,
    );
  });

  // ── Toggle (role="switch") ────────────────────────────────────────────────
  // Toggle renders a <button role="switch"> — caller must provide an accessible
  // name via aria-label or an associated <label>. Not a primitive defect.
  it("Toggle with aria-label has an accessible name", async () => {
    await expectClean(
      <Toggle
        checked={false}
        onCheckedChange={() => undefined}
        aria-label="Enable notifications"
      />,
    );
  });

  // ── Slider ────────────────────────────────────────────────────────────────
  // Slider renders <input type="range"> — needs an accessible name from caller.
  it("Slider with aria-label has an accessible name", async () => {
    await expectClean(
      <Slider value={50} onValueChange={() => undefined} aria-label="Volume" min={0} max={100} />,
    );
  });

  // ── SegmentedControl ──────────────────────────────────────────────────────
  it("SegmentedControl with aria-label is axe-clean", async () => {
    await expectClean(
      <SegmentedControl
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
        ]}
        value="week"
        onValueChange={() => undefined}
        aria-label="Time range"
      />,
    );
  });

  // ── Button ────────────────────────────────────────────────────────────────
  it("Button with text content is axe-clean", async () => {
    await expectClean(<Button>Save changes</Button>);
  });

  // ── Badge ─────────────────────────────────────────────────────────────────
  it("Badge with text content is axe-clean", async () => {
    await expectClean(<Badge>New</Badge>);
  });

  // ── EmptyState ────────────────────────────────────────────────────────────
  it("EmptyState with title and message is axe-clean", async () => {
    await expectClean(
      <EmptyState title="No results found" message="Try adjusting your search filters." />,
    );
  });
});
