# Design — Phase 5c: Auth & Public Edges Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Context

Final Phase-5 sub-phase (5a event-config #65, 5b org/tables #66 merged). 5c covers the
remaining auth + public surfaces and the admin audit log. This completes the monochrome
design-system rollout across the whole app (scanner remains the intended big/bold exception).

## Goal (5c)

Migrate the login form and the walk-in info form to the `Field`/`Input`/`Select`/`Textarea`
kit, convert the public info page's not-found edge state to `EmptyState`, and tokenize the
audit log's result chips (adding a `--warning-foreground` token to pair with `--warning`).

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| Walk-in **claim** page | **Out of scope — kept as-is.** Its full-screen bold green/red ✓/✕ confirmations are the public twin of the scanner confirm screens (direction #3 glanceable exception). |
| **invites** page | Out of scope — already token-based (status card, no raw controls/colors). |
| Audit result chips | **Solid semantic chips** — success→`bg-success`, warning→`bg-warning`, danger→`bg-destructive`; add a `--warning-foreground` token. |

## Foundation building blocks (on `main`, #60–#66)

- `@/components/ui/field`, `input`, `select`, `textarea`, `empty-state`.
- `@/lib/illustrations` — `NoEvents`.
- Tokens: `--success`/`--success-foreground`, `--warning` (added 5a); this phase adds `--warning-foreground`.

## Section A — `--warning-foreground` token

**File:** `frontend/app/globals.css`
- In `@theme inline`, after `--color-warning`, add `--color-warning-foreground: var(--warning-foreground);`.
- In `:root`, next to `--warning`, add `--warning-foreground: oklch(0.205 0 0);` (near-black — most legible on the amber chip).
- In `.dark`, next to its `--warning`, add `--warning-foreground: oklch(0.205 0 0);` (near-black; the dark-mode `--warning` is a light amber, so dark text still reads).
- Extend `__tests__/theme/tokens.test.ts`: assert `--warning-foreground:` appears ≥2 times and `--color-warning-foreground: var(--warning-foreground)` is mapped.

## Section B — `login-form`

**File:** `frontend/components/auth/login-form.tsx`
- The email `<input>` (currently `… focus:outline-none focus:ring-2 focus:ring-ring`) → `Field label="Email" htmlFor="login-email"` wrapping `<Input id="login-email" type="email" required autoComplete="email" placeholder="you@example.com" …>`.
- The "Check your inbox" success card, the "Use a different email" `Button`, and the magic-link mutation are unchanged.

## Section C — `WalkinInfoForm`

**File:** `frontend/components/walkins/info-form.tsx`
Migrate identically to the Phase-4 `RegistrationForm`:
- Each field's `<label>+<input/select/textarea>` → `Field label={label(f)} htmlFor={`field-${f.field_key}`} optional={!f.required} error={fieldErrors[f.field_key]}` wrapping `Input`/`Select`/`Textarea` (`id` matching `htmlFor`; carry `type`/`rows`/`aria-required`; the select keeps its disabled placeholder `<option value="" disabled>Choose an option…</option>` + options).
- Remove: the required `*` span, the manual `aria-describedby`, the hand-rolled per-field error `<p id="${fieldId}-error">`, and the `inputClass`/`errorClass` consts.
- Preserve: the `Card` + banner `<img>` (unchanged — not next/image), the form `noValidate`, the form-level `formError` `<p className="text-sm text-destructive" role="alert">`, the client-side required validation, the `done` success `Card`, `useCompleteInfo`, and `markInfoCompleted`.

## Section D — `info/[token]` page

**File:** `frontend/app/(public)/e/[orgSlug]/[eventSlug]/info/[token]/page.tsx`
- The "Event not found" branch → `<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><div className="w-full max-w-md"><EmptyState illustration={NoEvents} title="Event not found" /></div></main>`.
- `loadEvent` and the open branch (renders `WalkinInfoForm`) are unchanged. (Async server component — `EmptyState`/illustrations are plain components, valid here.)

## Section E — `audit` page

**File:** `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`
- The `chipClass` (or equivalent) result→class mapping:
  - `success` → `bg-success text-success-foreground` (was `bg-green-600 text-white`)
  - `warning` → `bg-warning text-warning-foreground` (was `bg-amber-500 text-white`)
  - default/danger → `bg-destructive text-white` (was `bg-red-600 text-white`)
- All audit data fetching, table rendering, and filtering are unchanged.

## Testing

- **`__tests__/theme/tokens.test.ts`** — add assertions for `--warning-foreground` (both modes + theme map).
- **`login-form`** (create test): the email field is labeled via `Field` (`getByLabelText("Email")` is an `Input`, `data-slot="input"`).
- **`WalkinInfoForm`** (existing `__tests__/components/walkins/info-form.test.tsx`): keep green (label/role/validation preserved by the Field migration); add one test that a non-required field shows "Optional" and a required one does not (mirrors the Phase-4 registration-form test).
- **`audit`** — if `chipClass` is exported (or a small pure helper), unit-test it returns the semantic classes for success/warning/danger; otherwise assert via a rendered chip. (Determine exact approach when reading the file during planning; prefer a pure-function unit test if the helper is exported.)
- **`info/[token]` page** — async server component; verified by `tsc` + the `EmptyState` unit coverage (no bespoke async-server-component test).
- Full suite green; `tsc --noEmit` clean; `pnpm lint` 0 errors (pre-existing `<img>` warnings, incl. the info-form banner, remain) + `pnpm format:check` clean.

## Non-goals

- No changes to the claim page (kept) or invites page (already token-based).
- No backend/API changes; all hooks, validation, magic-link, walk-in-info, and audit logic unchanged.
- No `next/image` conversion of the walk-in info banner.

## Delivery

Single PR (5c), subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`. This is the last Phase-5 sub-phase — after it merges, the monochrome rollout is complete (scanner exempt by design).
