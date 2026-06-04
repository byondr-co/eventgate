# Design — Phase 5a: Event Configuration Forms Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Context

Phase 5 (the remaining un-migrated pages) was decomposed into three independent sub-phases,
to be done in sequence as separate PRs:

- **5a — Event configuration forms** (this spec): pin-management, walk-in settings,
  registration-form-builder, presentation editor, event-create wizard, stats-widget.
- **5b — Org, members & tables**: create-org form, org rename, members table, links table, events table.
- **5c — Auth & public edges**: login, invites, public info, claim, audit page.

## Goal (5a)

Adopt the monochrome design-system foundation across the event-configuration admin forms:
migrate raw `<label>+<input/textarea>` to the `Field`/`Input`/`Textarea` kit, move the
success messages to the `--success` token, introduce a `--warning` semantic token and apply
it (plus `--destructive`) to the stats widget, and token-align the form-builder's required
checkbox.

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| Stats warning vs danger | **Keep the two-level distinction** via a new `--warning` (amber) token for warnings + `--destructive` for danger — a deliberate, scoped exception to "less amber" for genuine ops-attention states. |
| Form-builder "required" toggle | **Token-aligned native `<input type="checkbox">`** (`accent-primary` + focus ring), not the Toggle primitive. |

## Foundation building blocks (on `main`, PRs #60–#64)

- `@/components/ui/field`, `@/components/ui/input`, `@/components/ui/textarea`.
- Tokens in `app/globals.css`: `--success`/`--color-success` already exist; this phase adds `--warning`/`--color-warning`.

## Section A — New `--warning` semantic token

**File:** `frontend/app/globals.css`.
- In `@theme inline`, after the `--color-success` mappings, add `--color-warning: var(--warning);`.
- In `:root`, add `--warning: oklch(0.72 0.16 75);` (amber).
- In `.dark`, add `--warning: oklch(0.8 0.15 75);` (lighter amber for dark surfaces).
- This makes `text-warning` (and `bg-warning`) available as utilities.
- Extend the tokens guard test (`__tests__/theme/tokens.test.ts`) to assert `--warning:` appears in both modes and `--color-warning: var(--warning)` is mapped.

## Section B — `stats-widget`

**File:** `frontend/components/events/stats-widget.tsx`
- Replace the inline tone ternary's color classes:
  - `tone === "warning"` → `text-warning` (was `text-amber-600 dark:text-amber-400`)
  - `tone === "danger"` → `text-destructive` (was `text-red-600 dark:text-red-400`)
  - `default` → unchanged (no color).
- The tile data, `useEventStats`, and grid layout are unchanged.

## Section C — Config cards

**Files:** `frontend/components/events/pin-management-card.tsx`, `frontend/components/events/walkin-settings-card.tsx`
- Each raw `<label className="block"><span>…</span><input …/></label>` → `Field` (with `label` + `htmlFor`) wrapping `Input` (with matching `id`).
  - PIN fields: keep `type="text" inputMode="numeric" autoComplete="off"` and the `font-mono tracking-widest` styling via `Input`'s `className`. (`New PIN` id `event-pin`, `Confirm PIN` id `event-pin-confirm`.)
  - Capacity field: keep `type="number" inputMode="numeric" min={0} step={1}` and `font-mono` className; `id="walkin-capacity"`; the `disabled={event.isLoading}` and draft pattern preserved.
- Success message: `<p className="text-sm text-green-600">` → `<p className="text-sm text-success">`. Error stays `text-destructive`.
- All validation, mutation, and draft logic preserved verbatim.

## Section D — `event-create-wizard`

**File:** `frontend/components/events/event-create-wizard.tsx`
- The 4 raw inputs (event name, slug, and the other step fields) → `Field` + `Input`, preserving each input's existing attributes (the slug field keeps its `font-mono` styling) and the wizard's step state, slug auto-generation, and submit logic.

## Section E — `registration-form-builder`

**File:** `frontend/components/events/registration-form-builder.tsx`
- The text `<input>`s for field label/key/options → `Input` (wrapped in `Field` where a label exists; inline row inputs keep their compact placement with `Input` + `className` as needed).
- The per-field **"required" checkbox** (the `<label className="flex items-center gap-2 text-sm">` row) stays a native `<input type="checkbox">`, token-aligned: add `accent-primary` + `focus-visible:ring-3 focus-visible:ring-ring/50` (and `size-4 rounded`), keeping the label text.
- Add/remove/reorder field logic and the select for field-type are preserved (the field-type `<select>` → `Select` primitive if one exists; confirm during planning and migrate if a raw `<select>` is present).

## Section F — `event-presentation-editor`

**File:** `frontend/components/events/event-presentation-editor.tsx`
- The text input + the description textarea → `Field` + `Input`/`Textarea`. The banner upload (`FileDropZone`) and save logic are unchanged.

## Testing

- **`__tests__/theme/tokens.test.ts`** — add assertions for `--warning` (≥2 occurrences) and `--color-warning: var(--warning)`.
- For each migrated component, **keep its existing co-located test green** (verified per file during planning) and add a focused assertion where behavior is observable:
  - `stats-widget`: a warning tile uses `text-warning`, a danger tile uses `text-destructive`.
  - `pin-management-card` / `walkin-settings-card`: the success message uses `text-success` (and field error wiring works via `Field` if an error path is testable).
- Components without an existing test that are pure presentational primitive swaps are verified by `tsc` + lint + the full suite; add a minimal render/behavior test where it is cheap and meaningful (e.g. a field renders via `Field`).
- Full suite green; `tsc --noEmit` clean; `pnpm lint` 0 errors (pre-existing `<img>` warnings remain) + `pnpm format:check` clean.

## Non-goals

- No backend/API changes; all hooks, validation, draft patterns, wizard steps, and builder logic unchanged.
- No 5b/5c surfaces (org/members/tables, auth, public info/claim, audit) — separate sub-phases.
- The `--warning` token is the only new foundation addition; no other token changes.

## Delivery

Single PR (5a), subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`. Followed by 5b then 5c.
