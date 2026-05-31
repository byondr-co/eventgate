import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      links: "Links",
      devices: "Devices",
      helpdesk: "Help desk",
      audit: "Audit",
      settings: "Settings",
    };
    return map[key] ?? key;
  },
}));
vi.mock("@/lib/helpdesk", () => ({
  useOpenTicketsCount: vi.fn(),
}));
vi.mock("@/lib/guests", () => ({
  useGuestsCount: vi.fn(),
}));

import { usePathname } from "next/navigation";
import { useGuestsCount } from "@/lib/guests";
import { useOpenTicketsCount } from "@/lib/helpdesk";
import { EventTabsNav } from "@/components/nav/event-tabs-nav";

const mockPathname = vi.mocked(usePathname);
const mockOpenTickets = vi.mocked(useOpenTicketsCount);
const mockGuests = vi.mocked(useGuestsCount);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenTickets.mockReturnValue({ data: 0 } as never);
  mockGuests.mockReturnValue({ data: 0 } as never);
});

const ORG = "click-cam";
const EVT = "may-pilot";
const props = { orgSlug: ORG, eventSlug: EVT };

describe("EventTabsNav — href shapes", () => {
  it("renders 8 tabs with correct hrefs", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    const { container } = wrap(<EventTabsNav {...props} />);
    const hrefs = [
      `/orgs/${ORG}/events/${EVT}`,
      `/orgs/${ORG}/events/${EVT}/form`,
      `/orgs/${ORG}/events/${EVT}/guests`,
      `/orgs/${ORG}/events/${EVT}/links`,
      `/orgs/${ORG}/events/${EVT}/devices`,
      `/orgs/${ORG}/events/${EVT}/helpdesk`,
      `/orgs/${ORG}/events/${EVT}/audit`,
      `/orgs/${ORG}/events/${EVT}/settings`,
    ];
    for (const href of hrefs) {
      expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
    // Exactly 8 anchors (no extras)
    expect(container.querySelectorAll("a").length).toBe(8);
  });
});

describe("EventTabsNav — active state", () => {
  const cases: Array<{ pathname: string; expectedActiveLabel: string }> = [
    { pathname: `/orgs/${ORG}/events/${EVT}`, expectedActiveLabel: "Dashboard" },
    { pathname: `/orgs/${ORG}/events/${EVT}/form`, expectedActiveLabel: "Form" },
    { pathname: `/orgs/${ORG}/events/${EVT}/guests`, expectedActiveLabel: "Guests" },
    { pathname: `/orgs/${ORG}/events/${EVT}/devices`, expectedActiveLabel: "Devices" },
    { pathname: `/orgs/${ORG}/events/${EVT}/helpdesk`, expectedActiveLabel: "Help desk" },
    { pathname: `/orgs/${ORG}/events/${EVT}/audit`, expectedActiveLabel: "Audit" },
    { pathname: `/orgs/${ORG}/events/${EVT}/settings`, expectedActiveLabel: "Settings" },
  ];

  cases.forEach(({ pathname, expectedActiveLabel }) => {
    it(`marks "${expectedActiveLabel}" active on ${pathname}`, () => {
      mockPathname.mockReturnValue(pathname);
      wrap(<EventTabsNav {...props} />);
      const activeTab = screen.getByRole("link", { name: new RegExp(expectedActiveLabel, "i") });
      expect(activeTab).toHaveAttribute("aria-current", "page");
    });
  });

  it("does NOT mark Dashboard active on a sub-route", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}/devices`);
    wrap(<EventTabsNav {...props} />);
    const dashboardTab = screen.getByRole("link", { name: /Dashboard/i });
    expect(dashboardTab).not.toHaveAttribute("aria-current", "page");
  });

  it("activates Guests tab on imports/[id] deep route", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}/imports/abc-123`);
    wrap(<EventTabsNav {...props} />);
    const guestsTab = screen.getByRole("link", { name: /Guests/i });
    expect(guestsTab).toHaveAttribute("aria-current", "page");
  });
});

describe("EventTabsNav — badge counts", () => {
  it("renders Help desk count when > 0", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockOpenTickets.mockReturnValue({ data: 3 } as never);
    wrap(<EventTabsNav {...props} />);
    const helpdeskTab = screen.getByRole("link", { name: /Help desk/i });
    expect(helpdeskTab.textContent).toMatch(/3/);
  });

  it("renders no Help desk badge when count is 0", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockOpenTickets.mockReturnValue({ data: 0 } as never);
    wrap(<EventTabsNav {...props} />);
    const helpdeskTab = screen.getByRole("link", { name: /Help desk/i });
    // No badge number rendered
    expect(helpdeskTab.textContent).not.toMatch(/\d/);
  });

  it("renders no Help desk badge when count is undefined (loading/error)", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockOpenTickets.mockReturnValue({ data: undefined } as never);
    wrap(<EventTabsNav {...props} />);
    const helpdeskTab = screen.getByRole("link", { name: /Help desk/i });
    expect(helpdeskTab.textContent).not.toMatch(/\d/);
  });

  it("renders Guests count even when 0", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockGuests.mockReturnValue({ data: 0 } as never);
    wrap(<EventTabsNav {...props} />);
    const guestsTab = screen.getByRole("link", { name: /Guests/i });
    expect(guestsTab.textContent).toMatch(/0/);
  });

  it("renders Guests count 142", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockGuests.mockReturnValue({ data: 142 } as never);
    wrap(<EventTabsNav {...props} />);
    const guestsTab = screen.getByRole("link", { name: /Guests/i });
    expect(guestsTab.textContent).toMatch(/142/);
  });

  it("renders no Guests badge when count is undefined", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
    mockGuests.mockReturnValue({ data: undefined } as never);
    wrap(<EventTabsNav {...props} />);
    const guestsTab = screen.getByRole("link", { name: /Guests/i });
    expect(guestsTab.textContent).not.toMatch(/\d/);
  });
});
