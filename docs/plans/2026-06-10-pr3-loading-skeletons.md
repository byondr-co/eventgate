# PR3 — Full-Page Loading Skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every bare `Loading…` text node in the authenticated app (org-list, org dashboard, event dashboard, import detail, audit log) with shaped skeletons built from the existing `Skeleton`/`TableSkeleton` primitives, with a screen-reader announcement pattern.

**Architecture:** Each page gets a co-located named skeleton component (same file as what it mirrors) that uses the real `Card`/`CardHeader`/`CardContent` frames filled with `Skeleton` blocks, wrapped in `role="status"` + sr-only "Loading…" + `aria-hidden` visuals. `TableSkeleton` and `StatsWidget`'s tile skeleton are retrofitted to the same announcement pattern. Spec: `docs/superpowers/specs/2026-06-10-ui-ux-deepening-loading-skeletons-design.md`.

**Tech Stack:** Next.js (app router, client components), TanStack Query, Tailwind, vitest + @testing-library/react (jsdom), Playwright (pre-merge a11y check only).

---

## Context for the engineer (read first)

- **Working directory** for all commands: `frontend/` inside the repo. Run `nvm use 20` once per shell before any pnpm command.
- `pnpm test <path>` runs `vitest run <path>`. The merge gate is `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`.
- **Heads-up from `frontend/AGENTS.md`:** this Next.js version has breaking changes vs. training data. This plan only edits existing client components/pages following their current idioms, so no new Next.js APIs are involved. If you deviate from the plan, consult `node_modules/next/dist/docs/` first.
- **Commit style** (repo convention): single-line conventional-commit subject. **No body, no `Co-Authored-By` trailer.** Pre-commit hooks may rewrite files; if they do, re-stage and re-commit. Never `--no-verify`. Commit from the repo root (paths below are repo-relative in git commands, `frontend/`-relative otherwise).
- **The shared a11y pattern** every skeleton in this plan follows:

  ```tsx
  <div role="status">
    <span className="sr-only">Loading…</span>
    <div aria-hidden="true">{/* visual skeleton blocks */}</div>
  </div>
  ```

  RTL's `getByRole("status")` only matches elements visible to the accessibility tree, so a nested `TableSkeleton` (which also carries `role="status"`) inside an `aria-hidden` container does NOT create duplicate matches. Avoid `getByText("Loading…")` in page tests — nested skeletons can legitimately produce two sr-only texts; assert via `getByRole("status")` instead.
- **Monochrome style note** (`frontend/docs/ui-style-note.md`): skeletons are greyscale only (`bg-muted` via the `Skeleton` primitive). No new colors.

### File map

| File | Change |
|---|---|
| `components/ui/table-skeleton.tsx` | retrofit announcement pattern |
| `components/ui/__tests__/table-skeleton.test.tsx` | **new** test |
| `components/events/stats-widget.tsx` | retrofit tile-skeleton announcement |
| `components/events/__tests__/stats-widget.test.tsx` | **new** test |
| `components/orgs/org-list.tsx` | + `OrgListSkeleton`, use it |
| `components/orgs/__tests__/org-list.test.tsx` | **new** test |
| `app/(app)/orgs/[slug]/page.tsx` | + `OrgDashboardSkeleton`, use it |
| `app/(app)/orgs/[slug]/__tests__/page.test.tsx` | **new** test |
| `app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` | + `EventDashboardSkeleton`, use it |
| `app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx` | **new** test |
| `app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx` | + `ImportDetailSkeleton`, use it |
| `app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx` | **new** test |
| `app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx` | skeleton title + `TableSkeleton` body |
| `app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx` | **new** test |

Named exports from page files are established in this repo (`audit/page.tsx` already exports `resultClasses`), so exporting `OrgDashboardSkeleton` etc. from page files is fine.

---

### Task 1: Retrofit `TableSkeleton` with the announcement pattern

**Files:**
- Modify: `frontend/components/ui/table-skeleton.tsx`
- Test (new): `frontend/components/ui/__tests__/table-skeleton.test.tsx`

All six current call sites render `<TableSkeleton />` with no props (verified), so moving `space-y-2` to the inner container changes nothing for callers.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/ui/__tests__/table-skeleton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TableSkeleton } from "@/components/ui/table-skeleton";

describe("TableSkeleton", () => {
  it("announces loading to screen readers", () => {
    render(<TableSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("hides the visual rows from assistive tech", () => {
    render(<TableSkeleton rows={3} />);
    const hidden = screen.getByRole("status").querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden!.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/ui/__tests__/table-skeleton.test.tsx`
Expected: FAIL — `getByRole("status")` finds nothing (current component has no `role`).

- [ ] **Step 3: Implement**

Replace the body of `frontend/components/ui/table-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div data-slot="table-skeleton" role="status" className={cn(className)}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export { TableSkeleton };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/ui/__tests__/table-skeleton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full unit suite (guards the 6 existing call sites)**

Run: `pnpm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/table-skeleton.tsx frontend/components/ui/__tests__/table-skeleton.test.tsx
git commit -m "feat(ui): announce TableSkeleton to screen readers"
```

---

### Task 2: Retrofit `StatsWidget` tile skeleton

**Files:**
- Modify: `frontend/components/events/stats-widget.tsx:12-20`
- Test (new): `frontend/components/events/__tests__/stats-widget.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/events/__tests__/stats-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatsWidget } from "@/components/events/stats-widget";
import { useEventStats } from "@/lib/event-stats";

vi.mock("@/lib/event-stats", () => ({ useEventStats: vi.fn() }));

const mockUseEventStats = vi.mocked(useEventStats);
type StatsResult = ReturnType<typeof useEventStats>;

describe("StatsWidget", () => {
  it("announces loading and hides the tile skeletons from assistive tech", () => {
    mockUseEventStats.mockReturnValue({ data: undefined, isLoading: true } as unknown as StatsResult);
    render(<StatsWidget orgSlug="acme" eventSlug="launch" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    const hidden = status.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden!.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it("renders tiles once loaded, with no skeleton", () => {
    mockUseEventStats.mockReturnValue({
      data: {
        checked_in: 5,
        registered_not_arrived: 2,
        displayed: 1,
        manual_review: 0,
        open_escalations: 0,
        conflicts_recent_15min: 0,
      },
      isLoading: false,
    } as unknown as StatsResult);
    render(<StatsWidget orgSlug="acme" eventSlug="launch" />);
    expect(screen.getByText("Checked in")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/events/__tests__/stats-widget.test.tsx`
Expected: FAIL — first test, no `role="status"` (loaded-state test passes already).

- [ ] **Step 3: Implement**

In `frontend/components/events/stats-widget.tsx`, replace the `isLoading` early return (lines 12–20):

```tsx
  if (isLoading || !data) {
    return (
      <div role="status">
        <span className="sr-only">Loading…</span>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/events/__tests__/stats-widget.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/events/stats-widget.tsx frontend/components/events/__tests__/stats-widget.test.tsx
git commit -m "feat(events): announce StatsWidget skeleton to screen readers"
```

---

### Task 3: `OrgListSkeleton`

**Files:**
- Modify: `frontend/components/orgs/org-list.tsx`
- Test (new): `frontend/components/orgs/__tests__/org-list.test.tsx`

Loaded shape to mirror: header row (`text-xl` title + outline button) above `grid gap-3 sm:grid-cols-2` of org cards (CardTitle name + role, CardContent slug line).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/orgs/__tests__/org-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrgList } from "@/components/orgs/org-list";
import { useOrgs } from "@/lib/orgs";

vi.mock("@/lib/orgs", () => ({ useOrgs: vi.fn() }));

const mockUseOrgs = vi.mocked(useOrgs);
type OrgsResult = ReturnType<typeof useOrgs>;

describe("OrgList", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseOrgs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as OrgsResult);
    render(<OrgList />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders org cards once loaded, with no skeleton", () => {
    mockUseOrgs.mockReturnValue({
      data: { count: 1, results: [{ id: "1", name: "Acme", slug: "acme", role: "owner" }] },
      isLoading: false,
      isError: false,
    } as unknown as OrgsResult);
    render(<OrgList />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/orgs/__tests__/org-list.test.tsx`
Expected: FAIL — loading test finds no `role="status"`.

- [ ] **Step 3: Implement**

In `frontend/components/orgs/org-list.tsx`:

Add to the imports:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

Add the skeleton component (above `OrgList`):

```tsx
export function OrgListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Replace the loading early return inside `OrgList`:

```tsx
  if (isLoading) return <OrgListSkeleton />;
```

(`Card`, `CardHeader`, `CardContent` are already imported; `CardTitle` stays imported for the loaded state.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/orgs/__tests__/org-list.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/orgs/org-list.tsx frontend/components/orgs/__tests__/org-list.test.tsx
git commit -m "feat(orgs): shaped loading skeleton for org list"
```

---

### Task 4: `OrgDashboardSkeleton` (org page)

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/page.tsx`
- Test (new): `frontend/app/(app)/orgs/[slug]/__tests__/page.test.tsx`

Loaded shape to mirror: `space-y-6`; header row (`flex flex-wrap items-center justify-between gap-3`) with name + `slug · role` line on the left and a Members button on the right; then `EventsTable` — a Card whose CardTitle is a flex row ("Events" + small "New event" button) with table rows in CardContent.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(app)/orgs/[slug]/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OrgDashboardPage from "@/app/(app)/orgs/[slug]/page";
import { useOrg } from "@/lib/orgs";

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "acme" }) }));
vi.mock("@/lib/orgs", () => ({ useOrg: vi.fn() }));
vi.mock("@/components/orgs/org-name-editor", () => ({
  OrgNameEditor: ({ name }: { name: string }) => <div>{name}</div>,
}));
vi.mock("@/components/events/events-table", () => ({
  EventsTable: () => <div data-testid="events-table" />,
}));

const mockUseOrg = vi.mocked(useOrg);
type OrgResult = ReturnType<typeof useOrg>;

describe("OrgDashboardPage", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseOrg.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as OrgResult);
    render(<OrgDashboardPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the dashboard once loaded, with no skeleton", () => {
    mockUseOrg.mockReturnValue({
      data: { id: "1", name: "Acme", slug: "acme", role: "owner" },
      isLoading: false,
      isError: false,
    } as unknown as OrgResult);
    render(<OrgDashboardPage />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByTestId("events-table")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(app)/orgs/[slug]/__tests__/page.test.tsx"`
Expected: FAIL — loading test finds no `role="status"`. (Quote the path: brackets/parens are shell-special.)

- [ ] **Step 3: Implement**

In `frontend/app/(app)/orgs/[slug]/page.tsx`:

Add imports:

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
```

Add the skeleton component (above the default export):

```tsx
export function OrgDashboardSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <TableSkeleton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Replace the loading early return inside `OrgDashboardPage`:

```tsx
  if (isLoading) return <OrgDashboardSkeleton />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(app)/orgs/[slug]/__tests__/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/orgs/[slug]/page.tsx" "frontend/app/(app)/orgs/[slug]/__tests__/page.test.tsx"
git commit -m "feat(orgs): shaped loading skeleton for org dashboard"
```

---

### Task 5: `EventDashboardSkeleton` (event page)

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`
- Test (new): `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx`

Loaded shape to mirror: `space-y-6`; header (`text-2xl` title + meta line); Status card (title + transition buttons); `StatsWidget`'s `grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6` of `h-16` tiles (identical to its internal skeleton, so the hand-off when the event resolves is seamless); Public-URL card (title + two code rows).

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EventDashboardPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/page";
import { useEvent } from "@/lib/events";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch" }),
}));
vi.mock("@/lib/events", () => ({ useEvent: vi.fn() }));
vi.mock("@/components/events/event-status-card", () => ({
  EventStatusCard: () => <div data-testid="event-status-card" />,
}));
vi.mock("@/components/events/stats-widget", () => ({
  StatsWidget: () => <div data-testid="stats-widget" />,
}));
vi.mock("@/components/events/public-url-card", () => ({
  PublicUrlCard: () => <div data-testid="public-url-card" />,
}));

const mockUseEvent = vi.mocked(useEvent);
type EventResult = ReturnType<typeof useEvent>;

describe("EventDashboardPage", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseEvent.mockReturnValue({ data: undefined, isLoading: true } as unknown as EventResult);
    render(<EventDashboardPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the dashboard once loaded, with no skeleton", () => {
    mockUseEvent.mockReturnValue({
      data: { id: "1", name: "Launch Party", slug: "launch", status: "live", venue: "" },
      isLoading: false,
    } as unknown as EventResult);
    render(<EventDashboardPage />);
    expect(screen.getByText("Launch Party")).toBeInTheDocument();
    expect(screen.getByTestId("event-status-card")).toBeInTheDocument();
    expect(screen.getByTestId("stats-widget")).toBeInTheDocument();
    expect(screen.getByTestId("public-url-card")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx"`
Expected: FAIL — loading test finds no `role="status"`.

- [ ] **Step 3: Implement**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`:

Add imports:

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
```

Add the skeleton component (above the default export):

```tsx
export function EventDashboardSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Replace the loading early return inside `EventDashboardPage`:

```tsx
  if (isLoading) return <EventDashboardSkeleton />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx" "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/__tests__/page.test.tsx"
git commit -m "feat(events): shaped loading skeleton for event dashboard"
```

---

### Task 6: `ImportDetailSkeleton` (import detail page)

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx`
- Test (new): `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx`

Loaded shape to mirror: `space-y-4`; header row (`text-2xl` "Import xxxxxxxx" + small Back button); Card with capitalize status title, an `h-2 w-full rounded` progress bar, and an "Imported X / Y" line.

This page calls `useQueryClient()`, so tests must render inside a `QueryClientProvider`.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ImportDetailPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page";
import { useImportStatus } from "@/lib/csv-imports";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch", id: "abc12345" }),
}));
vi.mock("@/lib/csv-imports", () => ({ useImportStatus: vi.fn() }));

const mockUseImportStatus = vi.mocked(useImportStatus);
type ImportResult = ReturnType<typeof useImportStatus>;

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ImportDetailPage />
    </QueryClientProvider>,
  );
}

describe("ImportDetailPage", () => {
  it("renders a shaped skeleton while loading", () => {
    mockUseImportStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ImportResult);
    renderPage();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the import status once loaded, with no skeleton", () => {
    mockUseImportStatus.mockReturnValue({
      data: {
        id: "abc12345",
        status: "running",
        total_rows: 10,
        imported_rows: 5,
        failed_rows: 0,
        error_report_url: null,
        created_at: "2026-06-10T00:00:00Z",
        completed_at: null,
      },
      isLoading: false,
    } as unknown as ImportResult);
    renderPage();
    expect(screen.getByText("Import abc12345")).toBeInTheDocument();
    expect(screen.getByText(/Imported 5 \/ 10/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx"`
Expected: FAIL — loading test finds no `role="status"`.

- [ ] **Step 3: Implement**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx`:

Add import:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

Add the skeleton component (above the default export; `Card`/`CardHeader`/`CardContent` are already imported):

```tsx
export function ImportDetailSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-2 w-full rounded" />
            <Skeleton className="h-4 w-64" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Replace the loading early return inside `ImportDetailPage`:

```tsx
  if (isLoading || !data) {
    return <ImportDetailSkeleton />;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx" "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/__tests__/page.test.tsx"
git commit -m "feat(events): shaped loading skeleton for import detail"
```

---

### Task 7: Audit page loading state

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`
- Test (new): `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx`

Adopt the established table pattern (as in events/members/guests tables): while loading, the `CardTitle` shows a skeleton block instead of `Loading…`, and `CardContent` shows `TableSkeleton` instead of the empty table shell. The retrofitted `TableSkeleton` provides the `role="status"` announcement.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AuditPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page";
import { useAuditEvents } from "@/lib/audit";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme", eventSlug: "launch" }),
}));
vi.mock("@/lib/audit", () => ({ useAuditEvents: vi.fn() }));

const mockUseAuditEvents = vi.mocked(useAuditEvents);
type AuditQueryResult = ReturnType<typeof useAuditEvents>;

describe("AuditPage", () => {
  it("renders a table skeleton while loading", () => {
    mockUseAuditEvents.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as AuditQueryResult);
    render(<AuditPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("Loading…", { ignore: ".sr-only" })).toBeNull();
    expect(
      document.querySelector('[data-slot="card-title"] [data-slot="skeleton"]'),
    ).not.toBeNull();
  });

  it("renders the row count and table once loaded, with no skeleton", () => {
    mockUseAuditEvents.mockReturnValue({
      data: { count: 0, next: null, results: [] },
      isLoading: false,
    } as unknown as AuditQueryResult);
    render(<AuditPage />);
    expect(screen.getByText("0 rows")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx"`
Expected: FAIL — no `role="status"`, and visible `Loading…` text exists.

- [ ] **Step 3: Implement**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`:

Add imports:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
```

Replace the `CardTitle` line:

```tsx
          <CardTitle className="text-base">
            {isLoading ? <Skeleton className="h-5 w-16" /> : `${data?.count ?? 0} rows`}
          </CardTitle>
```

Wrap the table so it only renders when not loading — change the opening of `CardContent` from:

```tsx
        <CardContent>
          <table className="w-full text-sm">
```

to:

```tsx
        <CardContent>
          {isLoading && <TableSkeleton />}
          {!isLoading && (
            <table className="w-full text-sm">
```

…and close the conditional after the matching `</table>`:

```tsx
            </table>
          )}
        </CardContent>
```

(Indentation of the table block shifts one level; let prettier settle it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx" "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/__tests__/page.test.tsx"
git commit -m "feat(events): skeleton loading state for audit log"
```

---

### Task 8: Full gate, e2e a11y check, PR

**Files:** none (verification + PR only)

- [ ] **Step 1: Confirm no bare Loading… remains in the app**

Run: `grep -rn "Loading…" --include="*.tsx" app components | grep -v sr-only | grep -v __tests__`
Expected: no output (every remaining `Loading…` lives in an sr-only span or a test).

- [ ] **Step 2: Run the four-command merge gate**

Run (from `frontend/`): `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: all four pass. If `format:check` fails, run `pnpm exec prettier --write .`, re-run the gate, and amend the relevant commit or add a `chore(frontend): format` commit.

- [ ] **Step 3: Run the Playwright a11y spec locally (required for UI changes)**

Run: `pnpm test:e2e tests/a11y.spec.ts`
Expected: PASS. It boots the app — if the dev server port is busy, stop the other instance first.

- [ ] **Step 4: Push and open the PR**

Verify the gh account first (`gh auth status` must show `vineidev`; switch with `gh auth switch -u vineidev` if not).

```bash
git push -u origin claude/quirky-lewin-160be0
gh pr create \
  --title "feat(ui): full-page loading skeletons for org/event/import/audit views (PR3)" \
  --body "PR3 of the UI/UX-deepening lane. Replaces every bare Loading… with shaped skeletons (role=status + sr-only announcement + aria-hidden visuals) mirroring each page's loaded layout. Retrofits TableSkeleton and StatsWidget's tile skeleton with the same announcement pattern. Spec: docs/superpowers/specs/2026-06-10-ui-ux-deepening-loading-skeletons-design.md. Plan: docs/plans/2026-06-10-pr3-loading-skeletons.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR opens against `main`; the CI `frontend` + `e2e` jobs pass.
