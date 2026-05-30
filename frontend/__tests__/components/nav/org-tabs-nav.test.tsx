import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "events" ? "Events" : key === "members" ? "Members" : key,
}));

import { usePathname } from "next/navigation";
import { OrgTabsNav } from "@/components/nav/org-tabs-nav";

const mockPathname = vi.mocked(usePathname);
const ORG = "click-cam";

beforeEach(() => vi.clearAllMocks());

describe("OrgTabsNav", () => {
  it("renders 2 tabs with correct hrefs on org dashboard", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}`);
    const { container } = render(<OrgTabsNav orgSlug={ORG} />);
    expect(container.querySelector(`a[href="/orgs/${ORG}/events"]`)).toBeInTheDocument();
    expect(container.querySelector(`a[href="/orgs/${ORG}/members"]`)).toBeInTheDocument();
    expect(container.querySelectorAll("a").length).toBe(2);
  });

  it("marks Events tab active on events path", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events`);
    render(<OrgTabsNav orgSlug={ORG} />);
    expect(screen.getByRole("link", { name: /Events/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Members tab active on members path", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/members`);
    render(<OrgTabsNav orgSlug={ORG} />);
    expect(screen.getByRole("link", { name: /Members/i })).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing when inside an event subtree", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/may-pilot/devices`);
    const { container } = render(<OrgTabsNav orgSlug={ORG} />);
    expect(container.firstChild).toBeNull();
  });
});
