# Skeleton Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Skeleton` primitive + reusable `TableSkeleton`, and replace the bare `Loading…` text on the migrated list/table/stats loaders with consistent skeleton placeholders.

**Architecture:** Two new presentational primitives in `components/ui/`, then swap the loading branch in six data tables + the stats widget. Purely the loading-branch JSX — all hooks, data shapes, and loaded/empty branches unchanged. Non-overlapping with the concurrent Plan M/N work.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (`animate-pulse` built-in), Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-06-ui-skeleton-loading-states-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier — re-add and commit if it reformats. Branch `claude/ui-skeleton-loading` (already created off `origin/main`).

## File Structure

**Created:**
- `frontend/components/ui/skeleton.tsx` — `Skeleton` primitive.
- `frontend/components/ui/table-skeleton.tsx` — `TableSkeleton` (N skeleton row-bars).

**Modified (loading branch only):**
- `frontend/components/events/device-table.tsx`
- `frontend/components/guests/guests-table.tsx`
- `frontend/components/orgs/members-table.tsx`
- `frontend/components/shorturls/links-table.tsx`
- `frontend/components/events/events-table.tsx`
- `frontend/components/events/registration-form-builder.tsx`
- `frontend/components/events/stats-widget.tsx`

**Tests created:**
- `frontend/__tests__/components/ui/skeleton.test.tsx`
- `frontend/__tests__/components/ui/table-skeleton.test.tsx`
- (loading-state assertions added to existing table/stats tests where cheap)

---

## Task 1: `Skeleton` primitive

**Files:**
- Create: `components/ui/skeleton.tsx`
- Test: `__tests__/components/ui/skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/ui/skeleton.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("renders a pulsing muted placeholder and merges className", () => {
    render(<Skeleton className="h-8 w-full" data-testid="sk" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveAttribute("data-slot", "skeleton");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-muted");
    expect(el.className).toContain("h-8");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/skeleton.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/skeleton'").

- [ ] **Step 3: Create `components/ui/skeleton.tsx`**

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/skeleton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/skeleton.tsx __tests__/components/ui/skeleton.test.tsx
git commit -m "feat(ui): add Skeleton primitive"
```

---

## Task 2: `TableSkeleton` helper

**Files:**
- Create: `components/ui/table-skeleton.tsx`
- Test: `__tests__/components/ui/table-skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/ui/table-skeleton.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TableSkeleton } from "@/components/ui/table-skeleton";

describe("TableSkeleton", () => {
  it("renders 5 skeleton rows by default", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeTruthy();
  });

  it("renders a custom row count", () => {
    const { container } = render(<TableSkeleton rows={3} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/table-skeleton.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/table-skeleton'").

- [ ] **Step 3: Create `components/ui/table-skeleton.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div data-slot="table-skeleton" className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export { TableSkeleton };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/table-skeleton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/table-skeleton.tsx __tests__/components/ui/table-skeleton.test.tsx
git commit -m "feat(ui): add TableSkeleton helper"
```

---

## Task 3: Adopt `TableSkeleton` on the six data tables

**Files:**
- Modify: `components/events/device-table.tsx`, `components/guests/guests-table.tsx`, `components/orgs/members-table.tsx`, `components/shorturls/links-table.tsx`, `components/events/events-table.tsx`, `components/events/registration-form-builder.tsx`
- Test: `__tests__/components/events/device-table.test.tsx` (add 1 loading test)

Each file has exactly one loading-branch paragraph `<p className="text-sm text-muted-foreground">Loading…</p>`. In each, add the import `import { TableSkeleton } from "@/components/ui/table-skeleton";` (with the other `@/components/ui` imports) and replace that paragraph with `<TableSkeleton />`.

- [ ] **Step 1: Add a failing test** — append to `__tests__/components/events/device-table.test.tsx` (inside the existing `describe("DeviceTable", …)`):

```tsx
  it("shows a skeleton while loading", () => {
    mockUseDevices.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useDevices>);
    const { container } = render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/device-table.test.tsx -t "skeleton while loading"`
Expected: FAIL (loading branch still renders `<p>Loading…</p>`, no `table-skeleton`).

- [ ] **Step 3: Edit each of the six files**

**`components/events/device-table.tsx`** — add the import, then change:
```tsx
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
```
to:
```tsx
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
```

**`components/guests/guests-table.tsx`** — add the import, then change:
```tsx
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
```
to:
```tsx
        {guests.isLoading && <TableSkeleton />}
```

**`components/orgs/members-table.tsx`** — add the import, then change:
```tsx
          {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
```
to:
```tsx
          {members.isLoading && <TableSkeleton />}
```

**`components/shorturls/links-table.tsx`** — add the import, then change:
```tsx
          {links.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
```
to:
```tsx
          {links.isLoading && <TableSkeleton />}
```

**`components/events/events-table.tsx`** — add the import, then change:
```tsx
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
```
to:
```tsx
        {isLoading && <TableSkeleton />}
```

**`components/events/registration-form-builder.tsx`** — add the import, then change:
```tsx
          {fields.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
```
to:
```tsx
          {fields.isLoading && <TableSkeleton />}
```

The import line to add in each (alongside the existing `@/components/ui/*` imports):
```tsx
import { TableSkeleton } from "@/components/ui/table-skeleton";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run __tests__/components/events/device-table.test.tsx`
Expected: PASS — the new loading test plus all existing device-table tests (the existing tests mock `isLoading: false`, so the loaded/empty/tone branches are unaffected).

Run the other five tables' existing suites to confirm no regressions:
Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx __tests__/components/orgs/members-table.test.tsx __tests__/components/shorturls/links-table.test.tsx __tests__/components/events/events-table.test.tsx __tests__/components/events/registration-form-builder.test.tsx`
Expected: PASS (all mock `isLoading: false`; unaffected).

- [ ] **Step 5: Commit**

```bash
git add components/events/device-table.tsx components/guests/guests-table.tsx components/orgs/members-table.tsx components/shorturls/links-table.tsx components/events/events-table.tsx components/events/registration-form-builder.tsx __tests__/components/events/device-table.test.tsx
git commit -m "feat(ui): TableSkeleton loading states across data tables"
```

---

## Task 4: `stats-widget` skeleton tiles

**Files:**
- Modify: `components/events/stats-widget.tsx`
- Test: `__tests__/components/events/stats-widget.test.tsx` (add 1 loading test)

- [ ] **Step 1: Add a failing test** — append to `__tests__/components/events/stats-widget.test.tsx`:

```tsx
it("renders skeleton tiles while loading", () => {
  mockStats.mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useEventStats>);
  const { container } = render(<StatsWidget orgSlug="o" eventSlug="e" />);
  expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(6);
  expect(screen.queryByText("Loading counts…")).not.toBeInTheDocument();
});
```

(If the existing test file does not import `screen`, add it to the `@testing-library/react` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/stats-widget.test.tsx -t "skeleton tiles"`
Expected: FAIL (loading branch still renders the "Loading counts…" text).

- [ ] **Step 3: Edit `components/events/stats-widget.tsx`**

(a) Add the import after the `Card` import:
```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

(b) Replace the loading branch:
```tsx
  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading counts…</p>;
  }
```
with:
```tsx
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
```

Leave the tile data, `useEventStats`, and the loaded-state grid unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/stats-widget.test.tsx`
Expected: PASS — the new loading test plus the existing warning/danger-tone test (which mocks `isLoading: false`).

- [ ] **Step 5: Commit**

```bash
git add components/events/stats-widget.tsx __tests__/components/events/stats-widget.test.tsx
git commit -m "feat(events): skeleton tiles for the stats widget while loading"
```

---

## Task 5: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green (new Skeleton/TableSkeleton + loading tests + the rest).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (3 pre-existing `<img>` warnings remain); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Verify no leftover `Loading…` in the touched components**

Run: `grep -rnE "Loading…|Loading counts" components/events/device-table.tsx components/guests/guests-table.tsx components/orgs/members-table.tsx components/shorturls/links-table.tsx components/events/events-table.tsx components/events/registration-form-builder.tsx components/events/stats-widget.tsx`
Expected: no matches.

- [ ] **Step 4: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(ui): format skeleton loading states"
```

---

## Self-Review

- **Spec coverage:** §A `Skeleton` → Task 1; §B `TableSkeleton` → Task 2; §C six tables + stats → Tasks 3 + 4; testing/gate → per-task tests + Task 5. The excluded surfaces (claim page, audit count label, full-page wrappers) are intentionally not in any task. Covered.
- **Placeholder scan:** no TBD/TODO; every step shows complete code or an exact find/replace. Each table's loading line is matched exactly as it appears in its file.
- **Type consistency:** `Skeleton` (Task 1) is imported by `TableSkeleton` (Task 2) and `stats-widget` (Task 4); `TableSkeleton` (Task 2) imported by the six tables (Task 3); `data-slot` values `"skeleton"` / `"table-skeleton"` match the assertions in every test; the `mockUseDevices` / `mockStats` names in the added tests match those already defined in the existing test files.
