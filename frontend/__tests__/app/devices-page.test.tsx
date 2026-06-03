import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "o", eventSlug: "e" }),
}));
vi.mock("@/components/events/device-create-form", () => ({
  DeviceCreateForm: () => <div data-testid="create-form" />,
}));
vi.mock("@/components/events/device-table", () => ({
  DeviceTable: () => <div data-testid="device-table" />,
}));

import EventDevicesPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page";

describe("EventDevicesPage setup guide", () => {
  it("renders the four setup steps as a numbered guide", () => {
    render(<EventDevicesPage />);
    expect(screen.getByText("Create a device")).toBeInTheDocument();
    expect(screen.getByText("Copy the code")).toBeInTheDocument();
    expect(screen.getByText("Open the enrollment page")).toBeInTheDocument();
    expect(screen.getByText("Enter the event PIN")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("no longer renders the old decimal instruction list", () => {
    const { container } = render(<EventDevicesPage />);
    expect(container.querySelector("ol.list-decimal")).toBeNull();
  });
});
