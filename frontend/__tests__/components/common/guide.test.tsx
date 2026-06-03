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
});
