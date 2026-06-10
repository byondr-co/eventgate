import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Guide } from "@/components/common/guide";
import { InstallGuide } from "@/components/common/install-guide";
import { CopyCode, DeviceCreate } from "@/lib/illustrations";

describe("Guide", () => {
  it("renders an ordered list with one numbered step per item", () => {
    render(
      <Guide
        steps={[
          { illustration: DeviceCreate, title: "Create a device", body: "Choose role and label." },
          { illustration: CopyCode, title: "Copy the code", body: "One-time enrollment code." },
        ]}
      />,
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Create a device")).toBeInTheDocument();
    expect(screen.getByText("Copy the code")).toBeInTheDocument();
  });

  it("InstallGuide shows iOS and Android instructions", () => {
    render(<InstallGuide />);
    expect(screen.getByText(/iOS/i)).toBeInTheDocument();
    expect(screen.getByText(/Android/i)).toBeInTheDocument();
  });

  const makeSteps = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      illustration: DeviceCreate,
      title: `Step ${i + 1}`,
    }));

  it.each([
    {
      n: 0,
      expectClasses: [],
      absentClasses: ["sm:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"],
    },
    {
      n: 1,
      expectClasses: [],
      absentClasses: ["sm:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"],
    },
    {
      n: 2,
      expectClasses: ["sm:grid-cols-2"],
      absentClasses: ["lg:grid-cols-3", "lg:grid-cols-4"],
    },
    {
      n: 3,
      expectClasses: ["sm:grid-cols-2", "lg:grid-cols-3"],
      absentClasses: ["lg:grid-cols-4"],
    },
    {
      n: 4,
      expectClasses: ["sm:grid-cols-2", "lg:grid-cols-4"],
      absentClasses: ["lg:grid-cols-3"],
    },
    {
      n: 5,
      expectClasses: ["sm:grid-cols-2", "lg:grid-cols-4"],
      absentClasses: ["lg:grid-cols-3"],
    },
  ])("derives grid classes from $n step(s)", ({ n, expectClasses, absentClasses }) => {
    render(<Guide steps={makeSteps(n)} />);
    const classes = screen.getByRole("list").className.split(" ");
    for (const c of expectClasses) expect(classes).toContain(c);
    for (const c of absentClasses) expect(classes).not.toContain(c);
    expect(classes).toContain("grid");
    expect(classes).toContain("gap-4");
    expect(screen.queryAllByRole("listitem")).toHaveLength(n);
  });

  it("still merges a caller-provided className", () => {
    render(<Guide steps={makeSteps(2)} className="mt-6" />);
    expect(screen.getByRole("list").className).toContain("mt-6");
  });
});
