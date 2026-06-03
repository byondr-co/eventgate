# Design — Phase 3: Guests Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Goal

Adopt the monochrome design-system foundation on the guests surface — the highest-traffic
page during an event. Replace the toggle filter chips with two `SegmentedControl`s, the
raw search/page-size inputs with the `Input`/`Select` primitives, the green "Checked-in"
badge with the `--success` token, and the inline empty-message with the `EmptyState`
primitive (with a Clear-filters action when filters hide everything). Token-align the CSV
import dialog's one remaining raw control.

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| Filter model | **Two `SegmentedControl`s** (Type + Entry), each with an explicit "All" replacing toggle-off chips. |
| Filtered empty state | `EmptyState` with a **"Clear filters"** action; truly-empty shows message only (no button). |
| CSV import dialog | **In scope**, but only token-align the dense per-column mapping `<select>` — do NOT use the full `Select` primitive there (wrong fit for a compact inline control). |

## Foundation building blocks (on `main`, PRs #60–#62)

- `@/components/ui/segmented-control` — `SegmentedControl<T>({ options, value, onValueChange, className?, "aria-label"? })`; renders `role="group"` + one `<button aria-pressed>` per option; active = `bg-primary text-primary-foreground`.
- `@/components/ui/input`, `@/components/ui/select` (native, chevron, `h-9 w-full`), `@/components/ui/empty-state`.
- `@/lib/illustrations` — `NoGuests`.
- Tokens: `bg-success`/`text-success-foreground` (green semantic), greyscale elsewhere.

## Files

- `frontend/components/guests/guests-table.tsx` — filters, search, page-size, status badge, empty state (the bulk of the work).
- `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` — token-align the mapping select.
- `frontend/__tests__/components/guests/guests-table.test.tsx` — update 2 assertions + add empty-state tests.

## Section A — Filter bar → two `SegmentedControl`s

In `guests-table.tsx`:
- Remove the local `FilterChip` component (no longer used) and the `toggleGuestType`/`toggleEntryStatus` toggle-off helpers (replaced by direct setters).
- Render two controls in a `flex flex-wrap gap-3` row (replacing the `mb-4 flex flex-wrap gap-2` chip row):
  - **Type:** `<SegmentedControl aria-label="Filter by guest type" options={[{value:"",label:"All"},{value:"walk_in",label:"Walk-in"},{value:"pre_registered",label:"Pre-registered"}]} value={guestType} onValueChange={(v) => { setGuestType(v); setPage(1); }} />`
  - **Entry:** `<SegmentedControl aria-label="Filter by entry status" options={[{value:"",label:"All"},{value:"checked_in",label:"Checked-in"},{value:"registered_not_arrived",label:"Not arrived"}]} value={entryStatus} onValueChange={(v) => { setEntryStatus(v); setPage(1); }} />`
- `guestType`/`entryStatus` state and the `useGuests` call are unchanged; `""` continues to mean "no filter". Backend params unchanged.

## Section B — Search & page-size → primitives

- Search input → `<Input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, email, or phone…" className="mb-3 max-w-sm" />`.
- Rows-per-page `<select>` → `<Select id="page-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="w-auto">` with the same `PAGE_SIZES` `<option>`s. Keep the existing `<label htmlFor="page-size">Rows per page</label>`. (`Select` is `w-full` by default; `w-auto` via `cn`/tailwind-merge keeps it compact in the footer.)

## Section C — Status badge → success token

- The "Checked-in" badge: `<Badge className="bg-green-600 text-white">Checked-in</Badge>` → `<Badge className="bg-success text-success-foreground">Checked-in</Badge>`.
- The Type badges (`variant="secondary"` / `variant="outline"`) and the muted text for other entry statuses are unchanged.

## Section D — Empty state → `EmptyState` (`NoGuests`)

Replace the current empty branch:
```tsx
{guests.data && rows.length === 0 && (
  <p className="text-sm text-muted-foreground">
    {search || guestType || entryStatus ? "No matches." : "No registrations yet."}
  </p>
)}
```
with a conditional `EmptyState`:
- **Filtered** (`search || guestType || entryStatus` truthy):
  `<EmptyState illustration={NoGuests} title="No matching guests" message="Try a different search or clear the filters." action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>} />`
- **Truly empty** (no filters active):
  `<EmptyState illustration={NoGuests} title="No registrations yet" message="Guests appear here as they register or are imported." />`

Add a `clearFilters` handler: `setSearch(""); setGuestType(""); setEntryStatus(""); setPage(1);`.

## Section E — CSV import dialog (token-align only)

In `csv-import-dialog.tsx`, the per-column mapping `<select className="mt-1 rounded border px-1 py-0.5 text-[0.7rem]">` is a dense inline control inside a wide preview-table header. Do NOT replace it with the `Select` primitive (its `h-9 w-full` + chevron would break the dense layout). Instead token-align it:
`className="mt-1 rounded-md border border-input bg-transparent px-1 py-0.5 text-[0.7rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"`.
Everything else in the dialog already uses `Dialog`/`Button`/`text-destructive`/`CsvDropZone` and is unchanged.

## Testing

In `__tests__/components/guests/guests-table.test.tsx`:
- **Update** the "renders Checked-in distinctly" assertion: `bg-green-600` → `bg-success`.
- **Update** the "GuestsTable chips filter" group:
  - "requests guest_type=walk_in when the Walk-in segment is clicked" — still `fireEvent.click(screen.getByRole("button", { name: "Walk-in" }))`; expect `useGuests` last called with `guestType: "walk_in", page: 1` (unchanged — segments are buttons).
  - Replace "toggles a chip back off" with "selecting All clears the entry filter": click `Checked-in` → expect `entryStatus: "checked_in"`; then within the entry group (`within(screen.getByRole("group", { name: "Filter by entry status" }))`) click `All` → expect `entryStatus: ""`. Scope by group `aria-label` because two "All" buttons exist.
- **Add** empty-state tests:
  - Truly empty (no filters): `setGuests([], 0)` → `EmptyState` "No registrations yet" renders, and no "Clear filters" button.
  - Filtered empty: render, type in search (or click a segment) so a filter is active, then `setGuests([], 0)` re-render → "No matching guests" + "Clear filters" button present; clicking it resets (search input empty, `useGuests` called with empty `guestType`/`entryStatus`/`search`).
- Page-size tests, frozen-column tests, dynamic-column tests, walk-in/pre-registered tests, numbering test: unchanged (the `Select` primitive renders a native `<select>` so `getByLabelText("Rows per page")` + `.options` still work).
- Full suite green; `tsc --noEmit` clean; `pnpm lint` + `pnpm format:check` clean.

## Non-goals

- No backend/API changes; `useGuests` params, filtering, pagination, persistence, and the data-driven columns all unchanged.
- No restructuring of the table markup, sticky columns, or row-action logic (Email QR / Copy Telegram).
- No changes to other pages (public, auth, members, events sub-pages — later phases).

## Delivery

Single PR (guests adoption), subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`.
