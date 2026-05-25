import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be hoisted before the component import
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      home: "Home",
      dashboard: "Dashboard",
      form: "Form",
      guests: "Guests",
      devices: "Devices",
      helpdesk: "Help desk",
      audit: "Audit",
      settings: "Settings",
    };
    return map[key] ?? key;
  },
}));
vi.mock("@/lib/orgs", () => ({
  useOrg: vi.fn(),
}));
vi.mock("@/lib/events", () => ({
  useEvent: vi.fn(),
}));

import { usePathname } from "next/navigation";
import { useEvent } from "@/lib/events";
import { useOrg } from "@/lib/orgs";
import { BreadcrumbTrail } from "@/components/nav/breadcrumb-trail";

const mockPathname = vi.mocked(usePathname);
const mockUseOrg = vi.mocked(useOrg);
const mockUseEvent = vi.mocked(useEvent);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOrg.mockReturnValue({ data: { name: "The Click Cam", slug: "click-cam" } } as never);
  mockUseEvent.mockReturnValue({
    data: { name: "May Pilot Event", slug: "may-pilot" },
  } as never);
});

describe("BreadcrumbTrail", () => {
  it("renders Home → Org on org-only pathname", () => {
    mockPathname.mockReturnValue("/orgs/click-cam");
    wrap(<BreadcrumbTrail />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("The Click Cam")).toBeInTheDocument();
    expect(screen.queryByText("May Pilot Event")).not.toBeInTheDocument();
  });

  it("renders Home → Org → Event on event-detail pathname", () => {
    mockPathname.mockReturnValue("/orgs/click-cam/events/may-pilot");
    wrap(<BreadcrumbTrail />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("The Click Cam")).toBeInTheDocument();
    expect(screen.getByText("May Pilot Event")).toBeInTheDocument();
  });

  it("renders Home → Org → Event → Section on event sub-route", () => {
    mockPathname.mockReturnValue("/orgs/click-cam/events/may-pilot/devices");
    wrap(<BreadcrumbTrail />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("The Click Cam")).toBeInTheDocument();
    expect(screen.getByText("May Pilot Event")).toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
  });

  it("last segment is plain text, earlier segments are Links", () => {
    mockPathname.mockReturnValue("/orgs/click-cam/events/may-pilot/helpdesk");
    const { container } = wrap(<BreadcrumbTrail />);
    // Find anchor for "The Click Cam" (earlier segment → Link)
    const orgAnchor = container.querySelector('a[href="/orgs/click-cam"]');
    expect(orgAnchor).toBeInTheDocument();
    // "Help desk" is the current segment, should not be a link
    const helpdeskAnchor = container.querySelector(
      'a[href="/orgs/click-cam/events/may-pilot/helpdesk"]',
    );
    expect(helpdeskAnchor).not.toBeInTheDocument();
    expect(screen.getByText("Help desk")).toBeInTheDocument();
  });

  it("falls back to slug when useOrg / useEvent are loading", () => {
    mockUseOrg.mockReturnValue({ data: undefined } as never);
    mockUseEvent.mockReturnValue({ data: undefined } as never);
    mockPathname.mockReturnValue("/orgs/click-cam/events/may-pilot/audit");
    wrap(<BreadcrumbTrail />);
    // Falls back to slug, not blank
    expect(screen.getByText("click-cam")).toBeInTheDocument();
    expect(screen.getByText("may-pilot")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();
  });
});
