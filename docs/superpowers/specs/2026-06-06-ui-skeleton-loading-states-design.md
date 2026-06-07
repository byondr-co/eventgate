# Design — Skeleton Loading States (monochrome design system)

**Date:** 2026-06-06
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Context

The monochrome UI rollout (#60–#67) is complete. This is a follow-on UI/UX deepening piece —
fully presentational, **non-overlapping** with the concurrent Plan M & N work (pilot
reliability + Google Form bridge). It replaces the bare `Loading…` text on the migrated
list/table surfaces with consistent `Skeleton` placeholders.

## Goal

Add a `Skeleton` primitive + a reusable `TableSkeleton`, and adopt them on the content-area
loaders (data tables + the stats widget) so lists render a calm placeholder instead of a
flash of "Loading…" text.

## Scope (approved)

| Decision | Choice |
|---|---|
| Loaders in scope | The data-table/list loaders + the stats widget (clear content shapes). |
| Excluded (kept as-is) | The walk-in **claim** page ("Checking you in…", scanner-style exception); the **audit** inline `Loading…`/`N rows` count *label* (tiny, stays text); the **full-page** `Loading…` wrappers (`org-list`, org page, event page, imports detail) — deferred as a follow-up (need bespoke per-page layouts). |
| Token usage | `bg-muted` + `animate-pulse` (Tailwind built-in); greyscale, adapts to dark mode. No new tokens. |

## Foundation building blocks (on `main`, #60–#68)

- `@/lib/utils` `cn`; `data-slot` convention; `components/ui/*` primitive pattern.

## Section A — `Skeleton` primitive

**File:** `frontend/components/ui/skeleton.tsx`
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

## Section B — `TableSkeleton` helper

**File:** `frontend/components/ui/table-skeleton.tsx`
- Renders `rows` (default 5) full-width skeleton row-bars in a vertical stack — one consistent "rows loading" shape reused by every list/table loader (avoids per-table column bookkeeping).
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
(`aria-hidden` — the skeleton is decorative; screen readers needn't announce placeholder bars.)

## Section C — Adopt on content-area loaders

Replace each `{x.isLoading && <p …>Loading…</p>}` (or `if (isLoading) return <p…>`) with the skeleton:

- **`components/events/device-table.tsx`** — loading branch → `<TableSkeleton />`.
- **`components/guests/guests-table.tsx`** — `guests.isLoading` branch → `<TableSkeleton />`.
- **`components/orgs/members-table.tsx`** — `members.isLoading` branch → `<TableSkeleton />`.
- **`components/shorturls/links-table.tsx`** — `links.isLoading` branch → `<TableSkeleton />`.
- **`components/events/events-table.tsx`** — `isLoading` branch → `<TableSkeleton />`.
- **`components/events/registration-form-builder.tsx`** — `fields.isLoading` branch (the Fields card) → `<TableSkeleton />`.
- **`components/events/stats-widget.tsx`** — the `isLoading || !data` branch → the existing 6-tile grid filled with `<Skeleton className="h-16" />` tiles (so the layout doesn't jump), instead of the "Loading counts…" text. Keep the grid wrapper (`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6`).

All data hooks, table markup, empty/loaded branches, and logic are otherwise unchanged.

## Testing

- **`Skeleton`** (`__tests__/components/ui/skeleton.test.tsx`): renders a `div` with `data-slot="skeleton"`, includes `animate-pulse`/`bg-muted`, and merges a passed `className`.
- **`TableSkeleton`** (`__tests__/components/ui/table-skeleton.test.tsx`): renders the default 5 rows (5 `data-slot="skeleton"` children); a custom `rows={3}` renders 3.
- **Adoption** — for representative tables, assert the skeleton shows while loading without breaking existing tests:
  - `device-table`: mock `useDevices` `isLoading: true` → a `[data-slot="table-skeleton"]` (or `skeleton`) renders; existing empty/tone tests stay green.
  - `stats-widget`: `isLoading: true` → renders `data-slot="skeleton"` tiles (no "Loading counts…" text); the existing warning/danger-tone test stays green.
  - Other tables (`guests`, `members`, `links`, `events`, `form-builder`): their existing tests already mock `isLoading: false`, so they stay green unchanged; add a loading-state assertion where cheap.
- Full suite green; `tsc --noEmit` clean; `pnpm lint` 0 errors (pre-existing `<img>` warnings remain) + `pnpm format:check` clean.

## Non-goals

- No backend/API/hook changes; purely the loading-branch JSX.
- No changes to the claim page, audit count label, or full-page `Loading…` wrappers (latter deferred).
- No overlap with Plan M/N (pilot reliability + Google Form bridge).

## Delivery

Single PR, subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`.
