# PR4 — Guide grid derived from step count (UI/UX-deepening lane)

**Date:** 2026-06-11
**Status:** approved
**Branch base:** `origin/main` @ `385f49e` (branch `claude/pr4-guide-grid`, independent of PR3/#75 which is still open)
**Predecessors:** PR1 a11y + dark-mode (#71), CI e2e (#73), PR2 responsive (#74), PR3 loading skeletons (#75, open)

## Goal

`components/common/guide.tsx` hardwires its grid to
`sm:grid-cols-2 lg:grid-cols-4`. Any guide with fewer than 4 steps gets dead
columns at `lg` (and a 1-step guide gets a dead column at `sm`); more than 4
leaves an orphan card. Derive the column classes from `steps.length`.

## Scope

One component (`Guide`) + its test. `InstallGuide` is a separate component
that does not use `Guide` — out of scope. The devices page (the only current
`Guide` consumer, 4 steps) must render byte-identically to today.

## Design

Tailwind class names must be statically analyzable, so the mapping is a lookup
of literal class strings keyed by the clamped step count — no template
interpolation:

```tsx
const STEP_GRID: Record<1 | 2 | 3 | 4, string> = {
  1: "",                                  // single column everywhere
  2: "sm:grid-cols-2",                    // 2-up from sm; no lg class needed
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};
```

In `Guide`:

```tsx
const cols = Math.min(Math.max(steps.length, 1), 4) as 1 | 2 | 3 | 4;
<ol className={cn("grid gap-4", STEP_GRID[cols], className)}>
```

Mapping: 1→1 col, 2→2, 3→3, 4 or more→4 (5+ wraps to a second row; the clamp
was chosen over an orphan-minimizing rule — YAGNI, no caller has >4 steps).
Zero steps clamps to 1 and renders an empty `<ol>`. `className` merge,
`GuideStep` type, and the list-item markup are unchanged.

## Testing

Extend the existing `__tests__/components/common/guide.test.tsx` (root
`__tests__/` mirror tree — repo convention):

- Existing semantics test (ordered list, one numbered item per step) unchanged.
- New class assertions on the `<ol>` per step count: 1 step → no
  `sm:grid-cols-2`; 2 → `sm:grid-cols-2` and no `lg:grid-cols-` class; 3 →
  `lg:grid-cols-3`; 4 → `lg:grid-cols-4`; 5 → still `lg:grid-cols-4`.
- The devices-page test already pins the 4-step consumer.

Merge gate: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`,
plus a local `pnpm test:e2e tests/a11y.spec.ts` run before merge (UI change,
per `frontend/docs/ui-style-note.md`).

## Constraints

- Monochrome style note applies; no color or markup changes, classes only.
- Commit style: single-line conventional-commit subject, no trailer.
- `frontend/AGENTS.md`: consult `node_modules/next/dist/docs/` before writing
  page-file code (not expected to apply — component-only change).
