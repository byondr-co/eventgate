# Design — Phase 5b: Org, Members & Tables Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Context

Second of the three Phase-5 sub-phases (5a — event-config forms — merged in #65). This is 5b:
org/membership management + the remaining listing tables. 5c (auth + public info/claim +
audit) follows.

## Goal (5b)

Adopt the foundation across `create-org-form`, `org-name-editor`, `members-table`,
`shorturls/links-table`, and `events-table`: full-size form controls → `Field`/`Input`/`Select`;
dense inline controls → token-aligned native elements; blank tables → `EmptyState`; stray
greens (`text-emerald-600`) → `text-success`.

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| Dense inline controls | **Token-aligned native elements** (not the h-9 primitives): `org-name-editor`'s 2xl inline-edit input, the per-member-row role `<select>`, and `links-table`'s per-row note/date inputs. Same principle as the CSV mapping select. |
| Empty states | **Message-only `EmptyState`** (no action button) for `events-table` and `links-table` — each table's create affordance is adjacent. |
| create-org field | Wrap in `Field` with label "Organization name" (was placeholder-only). |

## Foundation building blocks (on `main`, #60–#65)

- `@/components/ui/field`, `@/components/ui/input`, `@/components/ui/select`, `@/components/ui/empty-state`, `@/components/ui/button` (incl. `icon-sm` size, `ghost` variant).
- `@/lib/illustrations` — `NoLinks`, `NoEvents`.
- Tokens: `text-success` for success messages.

## Section A — `create-org-form`

**File:** `frontend/components/orgs/create-org-form.tsx`
- The single name `<input>` (currently `focus:ring-2 focus:ring-ring`, placeholder-only) → `Field label="Organization name" htmlFor="org-name"` wrapping `<Input id="org-name" type="text" required minLength={2} maxLength={200} placeholder="byondr.co" …>`.
- Error stays `<p className="text-sm text-destructive">`; submit `Button` and create/redirect logic unchanged.

## Section B — `org-name-editor`

**File:** `frontend/components/orgs/org-name-editor.tsx`
- The inline-edit input is `text-2xl font-semibold` (h1-sized); the `Input` primitive does not fit. Keep it a native `<input>` and only token-align the focus ring: replace `focus:outline-none focus:ring-2 focus:ring-ring` with `outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`. Keep `border border-input`, `text-2xl font-semibold`, autoFocus, onBlur/onKeyDown(save/cancel), `disabled`.
- The ✎ edit `<button>` → `<Button variant="ghost" size="icon-sm" aria-label="Edit organization name">✎</Button>`.
- The existing `org-name-editor.test.tsx` must stay green (queries by role/label and edit behavior — unchanged).

## Section C — `members-table`

**File:** `frontend/components/orgs/members-table.tsx`
- **Invite row** (`grid sm:grid-cols-[1fr_140px_auto]`): email `<input type="email">` → `Input`; role `<select>` → `Select` (fills the 140px cell); `Button` unchanged.
- **Success message:** `<p className="mt-3 text-sm text-emerald-600">` → `text-success`.
- **Per-member-row role `<select>`** (dense `text-xs` table cell, `px-2 py-1`): keep a native `<select>`, token-align only — `border border-input` (keep), add `bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50`, keep `rounded px-2 py-1 text-xs`. Do NOT use the `Select` primitive here (too bulky for the cell).
- All membership/invite/role-update/remove logic, the `ConfirmDialog` flows, and the pending-invites card are unchanged. Existing `members-table.test.tsx` stays green.

## Section D — `links-table`

**File:** `frontend/components/shorturls/links-table.tsx`
- **Create row** (`grid sm:grid-cols-[1fr_180px_auto]`): note `<input>` → `Input`; expiry `<input type="date">` → `Input type="date"`; `Button` unchanged.
- **Empty state:** `<p>No links yet.</p>` → `<EmptyState illustration={NoLinks} title="No links yet" message="Create a registration link above to share it on social or in a bio." />` (no action).
- **Per-row inline inputs** (note text + date, dense `text-xs` cells): keep native `<input>`s, token-align only — keep `border border-input rounded px-2 py-1 text-xs`, add `bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50`. Their `defaultValue` + `onBlur`/`onChange` update logic is unchanged.
- Create/copy/disable/enable logic and `ConfirmDialog` unchanged.

## Section E — `events-table`

**File:** `frontend/components/events/events-table.tsx`
- **Empty state:** the `<p>No events yet. Create your first one…</p>` → `<EmptyState illustration={NoEvents} title="No events yet" message="Create your first event to get a public registration URL." />` (no action — the "New event" link is in the card title).
- `eventStatusVariant` + status `Badge` variants and the "New event" `buttonVariants` link are unchanged.

## Testing

- **`create-org-form`** (create test): the name field is labeled via `Field` (`getByLabelText("Organization name")` is an `Input`, `data-slot="input"`).
- **`links-table`** (create test): empty state renders `EmptyState` ("No links yet"); the create-row note input is the `Input` primitive (`data-slot="input"`). Mock `useShortUrls`/`useCreateShortUrl`/`useUpdateShortUrl` + `notify`.
- **`events-table`** (create test): empty state renders `EmptyState` ("No events yet"); a non-empty list still renders the event names + status badges. Mock `useEvents`.
- **`members-table`** (extend existing test): the invite-success message uses `text-success`. Keep all existing assertions green.
- **`org-name-editor`** (existing test): keep green; no new assertions required (token-only change).
- Full suite green; `tsc --noEmit` clean; `pnpm lint` 0 errors (pre-existing `<img>` warnings remain) + `pnpm format:check` clean.

## Non-goals

- No backend/API changes; all hooks, mutations, ConfirmDialog flows, and table data logic unchanged.
- No 5c surfaces (auth, public info/claim, audit).
- The dense inline controls are deliberately NOT migrated to the h-9 primitives (token-aligned only).

## Delivery

Single PR (5b), subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`. Followed by 5c.
