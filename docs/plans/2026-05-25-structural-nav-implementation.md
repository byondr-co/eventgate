# Structural Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent event-context tab bar + breadcrumb trail to the Gatethres dashboard, with live count badges on the Help desk and Guests tabs, before pilot opens 2026-06-05.

**Architecture:** A new Next.js segment layout at `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx` wraps every event sub-route with `<BreadcrumbTrail>` + `<EventTabsNav>` components. The tab bar's badge counts come from two new react-query hooks that hit existing paginated endpoints with `page_size=1` (DRF returns `count` regardless). The button row currently on the event detail page is removed — tabs replace it.

**Tech Stack:** Next.js 15 (App Router), TypeScript, React, TanStack Query, shadcn-ui (base-nova), next-intl, vitest, Tailwind.

**Spec:** [`docs/plans/2026-05-25-structural-nav-design.md`](2026-05-25-structural-nav-design.md) (committed ff2f697 on `feature/structural-nav`).

**Branch:** `feature/structural-nav` (already created from main tip `6cb8cec`). Single PR target → `main`.

---

## Pre-flight (do this once at the start of execution)

- [ ] **Step 0.1 — Verify you are on the right branch and clean.**

  Run from the worktree root:
  ```bash
  git branch --show-current
  ```
  Expected: `feature/structural-nav`

  ```bash
  git status --short
  ```
  Expected: empty output (clean working tree). The design spec is already committed at `ff2f697`.

- [ ] **Step 0.2 — Install frontend deps (in case lockfile drifted).**

  ```bash
  cd frontend && pnpm install --frozen-lockfile
  ```
  Expected: no errors; "Done in Xs".

  Return to worktree root before continuing.

---

## Task 1: Add the shadcn `Breadcrumb` primitive

**Files:**
- Create: `frontend/components/ui/breadcrumb.tsx` (via shadcn CLI)

- [ ] **Step 1.1 — Run the shadcn add command.**

  ```bash
  cd frontend && pnpm dlx shadcn@latest add breadcrumb --yes
  ```
  Expected stdout includes a line like `✔ Created components/ui/breadcrumb.tsx`. Do not edit the file content; we use the shadcn defaults.

- [ ] **Step 1.2 — Verify the file exists and is syntactically valid.**

  ```bash
  cd frontend && test -f components/ui/breadcrumb.tsx && pnpm exec tsc --noEmit
  ```
  Expected: command succeeds (no output for tsc on clean type-check; exit code 0).

- [ ] **Step 1.3 — Commit.**

  ```bash
  git add frontend/components/ui/breadcrumb.tsx
  git commit -m "chore(ui): add shadcn breadcrumb primitive"
  ```

---

## Task 2: Add nav.* i18n keys to `en.json`

**Files:**
- Modify: `frontend/lib/i18n/messages/en.json`

- [ ] **Step 2.1 — Read the current file.**

  Confirm the current shape (single namespace `register` plus `language` key).

- [ ] **Step 2.2 — Replace the file with the new namespace added.**

  Final content of `frontend/lib/i18n/messages/en.json`:
  ```json
  {
    "nav": {
      "home": "Home",
      "dashboard": "Dashboard",
      "form": "Form",
      "guests": "Guests",
      "devices": "Devices",
      "helpdesk": "Help desk",
      "audit": "Audit",
      "settings": "Settings"
    },
    "register": {
      "title": "Register for {eventName}",
      "subtitle": "Fill in your details — you'll get a QR code by email.",
      "field_name": "Full name",
      "field_email": "Email",
      "field_phone": "Phone or Chat ID",
      "submit": "Register",
      "submitting": "Registering…",
      "selectPlaceholder": "Choose an option…",
      "eventNotFound": "Event not found.",
      "registrationClosed": "Registration is closed for this event.",
      "success_title": "You're registered!",
      "success_subtitle": "Show this QR code at the entrance.",
      "success_email_note": "We sent your QR code to your email. Show it at the entrance — staff will scan it.",
      "success_check_spam": "Didn't receive it? Check spam, or contact the event organizer."
    },
    "language": "English"
  }
  ```

- [ ] **Step 2.3 — Verify JSON is valid.**

  ```bash
  cd frontend && node -e "JSON.parse(require('fs').readFileSync('lib/i18n/messages/en.json','utf8'))" && echo OK
  ```
  Expected: `OK`

- [ ] **Step 2.4 — Commit.**

  ```bash
  git add frontend/lib/i18n/messages/en.json
  git commit -m "feat(i18n): add nav.* keys for structural nav"
  ```

---

## Task 3: Add count hooks for badges

These wrap existing endpoints with `page_size=1` and 30s polling. No dedicated hook tests — they're trivial wrappers; coverage comes from the component tests in Task 5.

**Files:**
- Modify: `frontend/lib/helpdesk.ts` (append `useOpenTicketsCount` near `useTickets`)
- Modify: `frontend/lib/guests.ts` (append `useGuestsCount` after `useGuests`)

- [ ] **Step 3.1 — Append `useOpenTicketsCount` to `frontend/lib/helpdesk.ts`.**

  Insert this function immediately after the existing `useTickets` function (around line 57 in the current file, before `claimTicket`):

  ```ts
  export function useOpenTicketsCount(orgSlug: string, eventSlug: string) {
    return useQuery({
      queryKey: ["helpdesk-open-count", orgSlug, eventSlug],
      queryFn: () =>
        ticketsEtagCache.fetchJSON<ListResponse>(
          `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/?status=open&page_size=1`,
        ),
      select: (data: ListResponse) => data.count,
      enabled: !!orgSlug && !!eventSlug,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    });
  }
  ```

- [ ] **Step 3.2 — Append `useGuestsCount` to `frontend/lib/guests.ts`.**

  Insert this function immediately after the existing `useGuests` function (around line 30, before `useRegisterPublic`):

  ```ts
  export function useGuestsCount(orgSlug: string, eventSlug: string) {
    return useQuery({
      queryKey: ["guests-count", orgSlug, eventSlug],
      queryFn: () =>
        apiFetch<Paginated<Guest>>(
          `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/?page_size=1`,
        ),
      select: (data: Paginated<Guest>) => data.count,
      enabled: !!orgSlug && !!eventSlug,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    });
  }
  ```

- [ ] **Step 3.3 — Type-check.**

  ```bash
  cd frontend && pnpm exec tsc --noEmit
  ```
  Expected: exit code 0, no output.

- [ ] **Step 3.4 — Commit.**

  ```bash
  git add frontend/lib/helpdesk.ts frontend/lib/guests.ts
  git commit -m "feat(nav): add useOpenTicketsCount and useGuestsCount badge hooks"
  ```

---

## Task 4: BreadcrumbTrail component (TDD)

**Files:**
- Create: `frontend/components/nav/breadcrumb-trail.tsx`
- Create: `frontend/__tests__/components/nav/breadcrumb-trail.test.tsx`

The component derives the trail from `usePathname()` and the active org/event data. Pure component — no fetch of its own; reuses `useOrg(slug)` and `useEvent(slug, eventSlug)` so cache is shared with the rest of the dashboard.

- [ ] **Step 4.1 — Write the failing test file.**

  Create `frontend/__tests__/components/nav/breadcrumb-trail.test.tsx`:
  ```tsx
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { render, screen } from "@testing-library/react";
  import { beforeEach, describe, expect, it, vi } from "vitest";

  // Mocks must be hoisted before the component import
  vi.mock("next/navigation", () => ({
    usePathname: vi.fn(),
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
  ```

- [ ] **Step 4.2 — Run the test and verify it fails.**

  ```bash
  cd frontend && pnpm test -- breadcrumb-trail
  ```
  Expected: tests fail because `BreadcrumbTrail` is not yet exported. Error message will be along the lines of `Failed to resolve import "@/components/nav/breadcrumb-trail"`.

- [ ] **Step 4.3 — Create the component.**

  Create `frontend/components/nav/breadcrumb-trail.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { useTranslations } from "next-intl";

  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "@/components/ui/breadcrumb";
  import { useEvent } from "@/lib/events";
  import { useOrg } from "@/lib/orgs";

  type Section = {
    key: "dashboard" | "form" | "guests" | "devices" | "helpdesk" | "audit" | "settings";
    slugs: string[]; // pathname-prefix slugs that map to this section
  };

  const SECTIONS: Section[] = [
    { key: "form", slugs: ["form"] },
    { key: "guests", slugs: ["guests", "imports"] }, // imports/[id] is a guest-list op
    { key: "devices", slugs: ["devices"] },
    { key: "helpdesk", slugs: ["helpdesk"] },
    { key: "audit", slugs: ["audit"] },
    { key: "settings", slugs: ["settings"] },
  ];

  type Crumb = { label: string; href?: string };

  function buildCrumbs(
    pathname: string,
    t: (key: string) => string,
    orgName: string | undefined,
    orgSlug: string | undefined,
    eventName: string | undefined,
    eventSlug: string | undefined,
  ): Crumb[] {
    const crumbs: Crumb[] = [{ label: t("home"), href: "/" }];
    if (!orgSlug) return crumbs;

    const orgHref = `/orgs/${orgSlug}`;
    const orgLabel = orgName ?? orgSlug;
    const onOrgPage = pathname === orgHref || pathname === `${orgHref}/members`;
    crumbs.push({ label: orgLabel, href: onOrgPage ? undefined : orgHref });
    if (onOrgPage) return crumbs;

    if (!eventSlug) return crumbs;
    const eventHref = `/orgs/${orgSlug}/events/${eventSlug}`;
    const eventLabel = eventName ?? eventSlug;
    const onEventDetail = pathname === eventHref;
    crumbs.push({ label: eventLabel, href: onEventDetail ? undefined : eventHref });
    if (onEventDetail) return crumbs;

    // Detect sub-route from the URL segment after the event slug
    const after = pathname.slice(eventHref.length + 1); // e.g. "devices" or "imports/abc-123"
    const firstSeg = after.split("/")[0];
    const matched = SECTIONS.find((s) => s.slugs.includes(firstSeg));
    if (matched) crumbs.push({ label: t(matched.key) });
    return crumbs;
  }

  export function BreadcrumbTrail() {
    const pathname = usePathname() ?? "/";
    const t = useTranslations("nav");

    // Parse the path to extract org and event slugs
    const orgMatch = pathname.match(/^\/orgs\/([a-z0-9-]+)/);
    const eventMatch = pathname.match(/^\/orgs\/[a-z0-9-]+\/events\/([a-z0-9-]+)/);
    const orgSlug = orgMatch?.[1];
    const eventSlug = eventMatch?.[1];

    const org = useOrg(orgSlug ?? "");
    const event = useEvent(orgSlug ?? "", eventSlug ?? "");

    const crumbs = buildCrumbs(
      pathname,
      t,
      org.data?.name,
      orgSlug,
      event.data?.name,
      eventSlug,
    );

    return (
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <>
                <BreadcrumbItem key={`item-${i}`}>
                  {last || !c.href ? (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator key={`sep-${i}`} />}
              </>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }
  ```

  Implementation notes for the engineer:
  - The React `<>` fragment inside `.map()` triggers a "missing key" warning. The plan uses `key={...}` on the inner elements; if eslint/React still complains, wrap with `<Fragment key={i}>...</Fragment>` instead.
  - The org-only-check uses `=== orgHref` OR `=== ${orgHref}/members` — these are the only org-level routes per spec §2. If a future org route appears, add it here.

- [ ] **Step 4.4 — Run the tests and verify they pass.**

  ```bash
  cd frontend && pnpm test -- breadcrumb-trail
  ```
  Expected: all 5 tests pass.

- [ ] **Step 4.5 — Lint, prettier, tsc.**

  ```bash
  cd frontend && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit
  ```
  Expected: all 3 pass (no output for tsc; lint and prettier complete cleanly).

  If prettier complains, run `pnpm prettier --write components/nav/breadcrumb-trail.tsx __tests__/components/nav/breadcrumb-trail.test.tsx` to fix formatting, then re-run `format:check` to confirm.

- [ ] **Step 4.6 — Commit.**

  ```bash
  git add frontend/components/nav/breadcrumb-trail.tsx frontend/__tests__/components/nav/breadcrumb-trail.test.tsx
  git commit -m "feat(nav): add BreadcrumbTrail component with org/event slug fallback"
  ```

---

## Task 5: EventTabsNav component (TDD)

**Files:**
- Create: `frontend/components/nav/event-tabs-nav.tsx`
- Create: `frontend/__tests__/components/nav/event-tabs-nav.test.tsx`

7 tabs with active-state detection, plus count badges on Help desk and Guests.

- [ ] **Step 5.1 — Write the failing test file.**

  Create `frontend/__tests__/components/nav/event-tabs-nav.test.tsx`:
  ```tsx
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { render, screen } from "@testing-library/react";
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("next/navigation", () => ({
    usePathname: vi.fn(),
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
    it("renders 7 tabs with correct hrefs", () => {
      mockPathname.mockReturnValue(`/orgs/${ORG}/events/${EVT}`);
      const { container } = wrap(<EventTabsNav {...props} />);
      const hrefs = [
        `/orgs/${ORG}/events/${EVT}`,
        `/orgs/${ORG}/events/${EVT}/form`,
        `/orgs/${ORG}/events/${EVT}/guests`,
        `/orgs/${ORG}/events/${EVT}/devices`,
        `/orgs/${ORG}/events/${EVT}/helpdesk`,
        `/orgs/${ORG}/events/${EVT}/audit`,
        `/orgs/${ORG}/events/${EVT}/settings`,
      ];
      for (const href of hrefs) {
        expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
      }
      // Exactly 7 anchors (no extras)
      expect(container.querySelectorAll("a").length).toBe(7);
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
  ```

- [ ] **Step 5.2 — Run the tests and verify they fail.**

  ```bash
  cd frontend && pnpm test -- event-tabs-nav
  ```
  Expected: tests fail because `EventTabsNav` is not yet exported.

- [ ] **Step 5.3 — Create the component.**

  Create `frontend/components/nav/event-tabs-nav.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { useTranslations } from "next-intl";

  import { useGuestsCount } from "@/lib/guests";
  import { useOpenTicketsCount } from "@/lib/helpdesk";
  import { cn } from "@/lib/utils";

  type TabKey = "dashboard" | "form" | "guests" | "devices" | "helpdesk" | "audit" | "settings";

  type TabSpec = {
    key: TabKey;
    /** Suffix appended to `/orgs/{org}/events/{event}` — empty string for the Dashboard tab. */
    suffix: string;
    /** Additional pathname suffixes that should also activate this tab. */
    aliases?: string[];
  };

  const TABS: TabSpec[] = [
    { key: "dashboard", suffix: "" },
    { key: "form", suffix: "/form" },
    { key: "guests", suffix: "/guests", aliases: ["/imports"] },
    { key: "devices", suffix: "/devices" },
    { key: "helpdesk", suffix: "/helpdesk" },
    { key: "audit", suffix: "/audit" },
    { key: "settings", suffix: "/settings" },
  ];

  function isTabActive(
    pathname: string,
    base: string,
    spec: TabSpec,
  ): boolean {
    if (spec.suffix === "") {
      // Dashboard — exact match only
      return pathname === base;
    }
    const tabPath = `${base}${spec.suffix}`;
    if (pathname === tabPath || pathname.startsWith(`${tabPath}/`)) return true;
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        const aliasPath = `${base}${alias}`;
        if (pathname === aliasPath || pathname.startsWith(`${aliasPath}/`)) return true;
      }
    }
    return false;
  }

  type Props = { orgSlug: string; eventSlug: string };

  export function EventTabsNav({ orgSlug, eventSlug }: Props) {
    const pathname = usePathname() ?? "";
    const t = useTranslations("nav");
    const openTickets = useOpenTicketsCount(orgSlug, eventSlug);
    const guests = useGuestsCount(orgSlug, eventSlug);

    const base = `/orgs/${orgSlug}/events/${eventSlug}`;

    return (
      <nav
        aria-label="Event sections"
        className="flex gap-1 overflow-x-auto border-b [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
      >
        {TABS.map((spec) => {
          const href = `${base}${spec.suffix}`;
          const active = isTabActive(pathname, base, spec);
          const label = t(spec.key);

          let badge: number | null = null;
          if (spec.key === "helpdesk") {
            badge = typeof openTickets.data === "number" && openTickets.data > 0 ? openTickets.data : null;
          } else if (spec.key === "guests") {
            badge = typeof guests.data === "number" ? guests.data : null;
          }

          return (
            <Link
              key={spec.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 px-3 py-2 text-sm rounded-t-md border border-transparent border-b-0 whitespace-nowrap",
                active
                  ? "bg-background text-foreground font-semibold border-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {badge !== null && (
                <span className="ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }
  ```

- [ ] **Step 5.4 — Run the tests and verify they pass.**

  ```bash
  cd frontend && pnpm test -- event-tabs-nav
  ```
  Expected: all 14 tests pass (1 hrefs + 7 active states + 1 dashboard-not-active-on-sub-route + 1 imports-deep-route + 5 badge cases).

- [ ] **Step 5.5 — Lint, prettier, tsc.**

  ```bash
  cd frontend && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit
  ```
  Expected: all 3 pass.

  If prettier complains, run `pnpm prettier --write components/nav/event-tabs-nav.tsx __tests__/components/nav/event-tabs-nav.test.tsx`, then re-check.

- [ ] **Step 5.6 — Commit.**

  ```bash
  git add frontend/components/nav/event-tabs-nav.tsx frontend/__tests__/components/nav/event-tabs-nav.test.tsx
  git commit -m "feat(nav): add EventTabsNav with active state and badge counts"
  ```

---

## Task 6: Wire the event-context layout

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx`

- [ ] **Step 6.1 — Create the layout file.**

  Create `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx`:
  ```tsx
  import type { ReactNode } from "react";

  import { BreadcrumbTrail } from "@/components/nav/breadcrumb-trail";
  import { EventTabsNav } from "@/components/nav/event-tabs-nav";

  type Props = {
    children: ReactNode;
    params: Promise<{ slug: string; eventSlug: string }>;
  };

  export default async function EventLayout({ children, params }: Props) {
    const { slug, eventSlug } = await params;
    return (
      <div className="space-y-4">
        <BreadcrumbTrail />
        <EventTabsNav orgSlug={slug} eventSlug={eventSlug} />
        {children}
      </div>
    );
  }
  ```

  Implementation notes:
  - **Next.js 15 `params` is a Promise** — that's why we `await` it. This matches the existing `app/(public)/e/[orgSlug]/[eventSlug]/...` pattern; if any helper exists in the codebase for unwrapping params, use it instead.
  - The layout itself is a Server Component (no `"use client"`); the children components (`BreadcrumbTrail`, `EventTabsNav`) are Client Components. Next.js handles the boundary automatically.

- [ ] **Step 6.2 — Type-check.**

  ```bash
  cd frontend && pnpm exec tsc --noEmit
  ```
  Expected: exit 0.

  If tsc complains about `params` not being a Promise (e.g., on an older Next version), read `frontend/AGENTS.md` for the current Next.js conventions and adjust. Per `frontend/AGENTS.md`, this version of Next.js has breaking changes — verify the params shape by checking another nested dynamic-route layout (e.g., `app/(auth)/invites/[token]/page.tsx` if it exists).

- [ ] **Step 6.3 — Run the existing vitest suite to confirm no regression.**

  ```bash
  cd frontend && pnpm test
  ```
  Expected: all tests pass (no test directly exercises the layout; we're verifying nothing else broke).

- [ ] **Step 6.4 — Commit.**

  ```bash
  git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx"
  git commit -m "feat(nav): add event-context layout with breadcrumb + tabs"
  ```

---

## Task 7: Remove the button row from the event detail page

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`

Currently this page has a manual button row (Form / Guests / Devices / Help desk / Audit / Settings) at the top. With the new tab bar in the layout, the button row is duplicative — remove it.

- [ ] **Step 7.1 — Read the current file to confirm shape.**

  ```bash
  cat "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx"
  ```
  Expected: the file contains `<div className="flex gap-2">` followed by 6 `<Link>` button-styled elements (lines roughly 30-67).

- [ ] **Step 7.2 — Replace the file with the trimmed version.**

  New content for `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`:
  ```tsx
  "use client";

  import { useParams } from "next/navigation";

  import { EventStatusCard } from "@/components/events/event-status-card";
  import { StatsWidget } from "@/components/events/stats-widget";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { useEvent } from "@/lib/events";

  export default function EventDashboardPage() {
    const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
    const { data: event, isLoading } = useEvent(slug, eventSlug);

    if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
    if (!event) return <p className="text-sm text-destructive">Event not found.</p>;

    const publicUrl = `/e/${slug}/${eventSlug}/register`;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.slug} · {event.status} · {event.venue || "—"}
          </p>
        </div>

        <EventStatusCard event={event} orgSlug={slug} eventSlug={eventSlug} />

        <StatsWidget orgSlug={slug} eventSlug={eventSlug} />

        <Card>
          <CardHeader>
            <CardTitle>Public registration link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono break-all">{publicUrl}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Share this URL with attendees. Counts and live arrivals land in Plan D.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  Changes from the previous version:
  - Removed `import Link from "next/link"` (no longer used here)
  - Removed `import { buttonVariants } from "@/components/ui/button"` (no longer used here)
  - Removed the entire `<div className="flex gap-2">` button row and its 6 `<Link>` children
  - The outer header `<div className="flex items-center justify-between">` becomes a plain `<div>` since there's no right-side content to align against

- [ ] **Step 7.3 — Type-check and lint.**

  ```bash
  cd frontend && pnpm exec tsc --noEmit && pnpm lint
  ```
  Expected: both pass (no output for tsc; lint completes cleanly). If lint complains about unused imports, double-check the removal.

- [ ] **Step 7.4 — Run vitest.**

  ```bash
  cd frontend && pnpm test
  ```
  Expected: all tests pass. The event-status-card test should still pass since it doesn't reference the button row.

- [ ] **Step 7.5 — Commit.**

  ```bash
  git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx"
  git commit -m "refactor(events): remove duplicate button row now covered by tab nav"
  ```

---

## Task 8: Full gate run + PR push

- [ ] **Step 8.1 — Run all 8 gates.**

  ```bash
  cd backend && uv run pytest -x
  ```
  Expected: PASS (283+ tests).

  ```bash
  cd backend && uv run mypy apps config
  ```
  Expected: `Success: no issues found in 147+ source files`.

  ```bash
  cd backend && uv run ruff check apps config
  ```
  Expected: `All checks passed!`

  ```bash
  cd backend && uv run ruff format --check apps config
  ```
  Expected: `XX files already formatted`.

  ```bash
  cd frontend && pnpm lint
  ```
  Expected: clean.

  ```bash
  cd frontend && pnpm format:check
  ```
  Expected: `All matched files use Prettier code style!`

  ```bash
  cd frontend && pnpm exec tsc --noEmit
  ```
  Expected: exit 0.

  ```bash
  cd frontend && pnpm test
  ```
  Expected: all tests pass (existing + ~16 new).

  If any gate fails, fix and re-stage on a new commit (do NOT amend).

- [ ] **Step 8.2 — Confirm branch matches expectations.**

  ```bash
  git log --oneline main..HEAD
  ```
  Expected output (in some order, but ideally chronological):
  ```
  refactor(events): remove duplicate button row now covered by tab nav
  feat(nav): add event-context layout with breadcrumb + tabs
  feat(nav): add EventTabsNav with active state and badge counts
  feat(nav): add BreadcrumbTrail component with org/event slug fallback
  feat(nav): add useOpenTicketsCount and useGuestsCount badge hooks
  feat(i18n): add nav.* keys for structural nav
  chore(ui): add shadcn breadcrumb primitive
  docs(plans): structural-nav design spec
  ```
  (The `docs(plans)` commit is the spec doc that was committed before plan execution.)

- [ ] **Step 8.3 — Push the branch to origin.**

  ```bash
  git push -u origin feature/structural-nav
  ```
  Expected: branch pushed successfully.

- [ ] **Step 8.4 — Open the PR.**

  Ensure gh CLI is on `vineidev`:
  ```bash
  gh auth switch --hostname github.com --user vineidev
  ```

  Then create the PR:
  ```bash
  gh -R vineidev/gatethres pr create \
    --head feature/structural-nav \
    --base main \
    --title "feat(nav): event-context breadcrumb + tab nav layout with badges" \
    --body "$(cat <<'EOF'
  ## Summary

  Solves the operator way-finding pain surfaced during Plan H T9 smoke. Adds a Next.js segment layout under \`orgs/[slug]/events/[eventSlug]/\` that wraps every event sub-route with:

  - A **breadcrumb trail** showing \`Home › Org › Event › Section\` with clickable parent segments
  - A **persistent contextual tab bar** with 7 tabs (Dashboard / Form / Guests / Devices / Help desk / Audit / Settings)
  - **Live badge counts** on Help desk (open tickets, 30s polling) and Guests (total registered, 30s polling)

  Design spec: \`docs/plans/2026-05-25-structural-nav-design.md\`

  ### Scope (matches spec §2)

  - Event-context routes only — org level stays breadcrumb-free for now (only 2 routes)
  - English-only nav labels — Khmer queued behind Vatana's full copy review
  - Help desk + Guests badges only — Devices is setup-time, Audit is noisy
  - No mobile hamburger drawer — tabs scroll horizontally on narrow viewports
  - Pure frontend pass — zero backend changes

  ### Test plan

  - [ ] CI green (pytest 283+, mypy clean, ruff×2, lint, prettier, tsc, vitest 65+)
  - [ ] Local smoke: navigate org → event → each sub-route; breadcrumb updates correctly; correct tab highlighted at each level
  - [ ] Local smoke: \`/orgs/x/events/y/imports/abc\` activates the **Guests** tab (special case)
  - [ ] Local smoke: with a registered guest, Guests tab shows \`Guests · 1\`; create an open ticket, Help desk tab shows \`Help desk · 1\` within 30s
  - [ ] Local smoke: mobile viewport (Chrome DevTools 360px) — tabs scroll horizontally without breaking layout

  ### Follow-ups (NOT in this PR)

  - Khmer translations of \`nav.*\` keys
  - Org-level breadcrumb / nav (only if pain surfaces in pilot)
  - Audit badge ("entries today") — only if operators report missing it
  - Sheet drawer for narrow viewports — only if door-day operators report scroll friction
  EOF
  )"
  ```

- [ ] **Step 8.5 — Report PR URL and CI status to the dispatcher.**

  Print the PR URL. The dispatcher will watch CI and merge when green.

---

## Self-review — completed inline

**Spec coverage check (against `docs/plans/2026-05-25-structural-nav-design.md`):**

| Spec section | Task coverage |
|---|---|
| §3 decision: contextual tab bar | Task 5 (EventTabsNav), Task 6 (layout) |
| §3 decision: event-level only | Task 6 (only event layout, no org layout) |
| §3 decision: Help desk + Guests badges | Task 3 (hooks), Task 5 (badge rendering + 5 badge tests) |
| §3 decision: 30s polling | Task 3 (`refetchInterval: 30000`) |
| §3 decision: mobile = horizontal scroll | Task 5 (`overflow-x-auto` + `mask-image` gradient) |
| §3 decision: i18n pattern in place, English-only copy | Task 2 (en.json keys), Task 4/5 (use `useTranslations("nav")`) |
| §4.1 layout file | Task 6 |
| §4.2 BreadcrumbTrail | Task 4 |
| §4.2 EventTabsNav | Task 5 |
| §4.3 shadcn Breadcrumb primitive | Task 1 |
| §4.4 count hooks | Task 3 |
| §4.5 remove button row | Task 7 |
| §5.1 active-route detection (dashboard exact match) | Task 5 (`isTabActive` + "Dashboard not active on sub-route" test) |
| §5.1 imports → Guests special case | Task 5 (`aliases: ["/imports"]` + dedicated test) |
| §5.2 breadcrumb slug fallback | Task 4 (`orgName ?? orgSlug` + "falls back to slug" test) |
| §5.3 mobile horizontal scroll | Task 5 (Tailwind class) |
| §5.4 badge rendering rules | Task 5 (5 badge tests cover all states) |
| §6 testing | Tasks 4 and 5 cover all listed test cases |
| §8 rollout (branch, commits, PR) | Pre-flight + Task 8 |

No gaps.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" tokens in the plan. Every code block is complete.

**Type consistency check:**
- `useOpenTicketsCount(orgSlug, eventSlug)` defined in Task 3.1, used in Task 5.3 — same signature ✓
- `useGuestsCount(orgSlug, eventSlug)` defined in Task 3.2, used in Task 5.3 — same signature ✓
- `BreadcrumbTrail` (no props) defined in Task 4.3, used in Task 6.1 — consistent ✓
- `EventTabsNav({ orgSlug, eventSlug })` defined in Task 5.3, used in Task 6.1 — consistent ✓
- i18n keys defined in Task 2.2 (`nav.home`, `nav.dashboard`, ..., `nav.settings`) consumed via `t(spec.key)` in Task 5.3 and `t(matched.key)` / `t("home")` in Task 4.3 — keys match ✓

Plan is internally consistent.
