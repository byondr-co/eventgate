# PR3 — Full-page loading skeletons (UI/UX-deepening lane)

**Date:** 2026-06-10
**Status:** approved
**Branch base:** `origin/main` @ `385f49e` (independent worktree, not stacked)
**Predecessors:** PR1 a11y + dark-mode (#71), CI e2e (#73), PR2 responsive (#74)

## Goal

Replace every bare `Loading…` text node in the authenticated app with shaped
skeletons built from the existing `Skeleton` / `TableSkeleton` primitives, so
loading states mirror the layout they resolve into.

## Scope

Five sites (the four named in the program plus the one remaining straggler):

| # | Site | Current loading state |
|---|------|----------------------|
| 1 | `components/orgs/org-list.tsx` | bare `<p>Loading…</p>` |
| 2 | `app/(app)/orgs/[slug]/page.tsx` (org dashboard) | bare `<p>Loading…</p>` |
| 3 | `app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (event dashboard) | bare `<p>Loading…</p>` |
| 4 | `.../events/[eventSlug]/imports/[id]/page.tsx` (import detail) | bare `<p>Loading…</p>` |
| 5 | `.../events/[eventSlug]/audit/page.tsx` | `Loading…` inside `CardTitle`, empty table below |

Error and empty states are **out of scope** — only `isLoading` branches change.
PR4 (Guide-grid) remains separate.

## Shared accessibility pattern

The current bare text is announced by screen readers; pure `aria-hidden`
skeletons would be a silent regression. Every skeleton therefore renders:

```tsx
<div role="status">
  <span className="sr-only">Loading…</span>
  <div aria-hidden="true">{/* skeleton blocks */}</div>
</div>
```

- `TableSkeleton` (`components/ui/table-skeleton.tsx`) is retrofitted to this
  pattern (today it is `aria-hidden` only).
- `StatsWidget`'s internal 6-tile skeleton gets the same treatment for
  uniformity — the only other bespoke skeleton in the app.
- The `Skeleton` primitive itself is unchanged.

## Structure

Skeletons are **co-located named components** defined next to what they mirror
(same file). Named exports from page files are already established in this
codebase (`audit/page.tsx` exports `resultClasses`). Each skeleton uses the
real `Card` / `CardHeader` / `CardContent` frames with `Skeleton` fills so
borders, padding, and spacing match the loaded state exactly. No new files in
`components/ui`.

## Per-site shapes

1. **`OrgListSkeleton`** (in `org-list.tsx`) — header row (title-width block +
   button-width block) above a `grid gap-3 sm:grid-cols-2` of 4 card-shaped
   blocks mirroring the org cards.
2. **`OrgDashboardSkeleton`** (in `orgs/[slug]/page.tsx`) — header block (name
   line + slug·role line, button block on the right, same
   `flex-wrap`/`min-w-0` row as the loaded header) + a Card mirroring
   `EventsTable` (title row + `TableSkeleton` rows in `CardContent`).
3. **`EventDashboardSkeleton`** (in the event page) — header (title + meta
   line) + Status card (title + two button-sized blocks) + the same
   `grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6` 6-tile grid that
   `StatsWidget` uses + Public-URL card (title + two code-line rows).
   **Full-page skeleton, not progressive reveal:** `EventStatusCard` cannot
   render without event data, and a half-loaded mix is janky. When the event
   query resolves, `StatsWidget`'s own tile skeleton takes over seamlessly
   because the shapes match.
4. **`ImportDetailSkeleton`** (in the imports page) — header row (title block +
   back-button block) + Card with title block, an `h-2 w-full rounded` bar
   mirroring the progress bar, and one text line.
5. **Audit page** — adopts the established table pattern
   (`{isLoading && <TableSkeleton />}` as in events/members/guests): while
   loading, `CardTitle` shows a small skeleton block instead of `Loading…` and
   `CardContent` shows `TableSkeleton` instead of the empty table shell.

## Testing

TDD per the lane's process (RTL + vitest, mocked query hooks):

- Per site: skeleton (`role="status"`) renders while the hook reports
  `isLoading`; loaded content renders (and skeleton does not) once data
  resolves.
- New `TableSkeleton` unit test (none exists today) for the `role="status"` +
  sr-only + `aria-hidden` structure.
- Merge gate: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`,
  plus a local `pnpm test:e2e` (a11y spec) run before merge since this touches
  UI (per `frontend/docs/ui-style-note.md`).

## Constraints

- Monochrome style note applies: skeletons are greyscale (`bg-muted`) only.
- `frontend/AGENTS.md`: consult `node_modules/next/dist/docs/` before writing
  page-file code (this Next.js version has breaking changes).
- Commit style: single-line conventional-commit subject, no trailer.
