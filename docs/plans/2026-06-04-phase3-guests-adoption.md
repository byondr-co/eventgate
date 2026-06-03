# Phase 3 — Guests Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the monochrome design system on the guests table — two `SegmentedControl` filters, `Input`/`Select` primitives, the `--success` "Checked-in" badge, and an `EmptyState` (with Clear-filters) — plus a token-align of the CSV import dialog's mapping select.

**Architecture:** Presentational swaps inside `components/guests/guests-table.tsx` (the high-traffic table) using already-merged primitives, preserving all data hooks, filtering params, pagination, persistence, and table markup. One adjacent file (`csv-import-dialog.tsx`) gets a class-only token tweak. The existing 244-line test is updated for the two changed behaviors and extended for the new ones.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase3-guests-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier on staged files — re-add and commit if it reformats. Branch `claude/phase3-guests-adoption` (already created off `main`).

## File Structure

**Modified:**
- `frontend/components/guests/guests-table.tsx` — filters, search, page-size, status badge, empty state.
- `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` — token-align mapping select (class-only).

**Test modified:**
- `frontend/__tests__/components/guests/guests-table.test.tsx`

The single test file `__tests__/components/guests/guests-table.test.tsx` is edited across Tasks 1–4; each task changes only its own region.

---

## Task 1: Filter bar → two `SegmentedControl`s

**Files:**
- Modify: `components/guests/guests-table.tsx`
- Test: `__tests__/components/guests/guests-table.test.tsx`

- [ ] **Step 1: Update the test** — replace the entire `describe("GuestsTable chips filter", …)` block with this `describe("GuestsTable segmented filters", …)` block:

```tsx
describe("GuestsTable segmented filters", () => {
  it("requests guest_type=walk_in when the Walk-in segment is clicked", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ guestType: "walk_in", page: 1 }),
    );
  });

  it("clears the entry filter when All is selected in the entry group", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.click(screen.getByRole("button", { name: "Checked-in" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ entryStatus: "checked_in" }),
    );
    const entryGroup = screen.getByRole("group", { name: "Filter by entry status" });
    fireEvent.click(within(entryGroup).getByRole("button", { name: "All" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ entryStatus: "" }),
    );
  });
});
```

(`within` is already imported in this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "segmented filters"`
Expected: FAIL — the "All is selected" test errors (no `role="group"` named "Filter by entry status", no "All" button) because the chips don't render a group or an All option yet.

- [ ] **Step 3: Edit `components/guests/guests-table.tsx`**

(a) Add the import (with the other `@/components/ui` imports):
```tsx
import { SegmentedControl } from "@/components/ui/segmented-control";
```

(b) Delete the local `FilterChip` component entirely — this whole block:
```tsx
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
```

(c) Delete the two toggle helpers:
```tsx
  // Type chips and entry chips are two single-select groups; clicking an active chip clears it.
  const toggleGuestType = (v: string) => {
    setGuestType((cur) => (cur === v ? "" : v));
    setPage(1);
  };
  const toggleEntryStatus = (v: string) => {
    setEntryStatus((cur) => (cur === v ? "" : v));
    setPage(1);
  };
```

(d) Replace the chip row:
```tsx
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={guestType === "walk_in"} onClick={() => toggleGuestType("walk_in")}>
            Walk-in
          </FilterChip>
          <FilterChip
            active={guestType === "pre_registered"}
            onClick={() => toggleGuestType("pre_registered")}
          >
            Pre-registered
          </FilterChip>
          <FilterChip
            active={entryStatus === "checked_in"}
            onClick={() => toggleEntryStatus("checked_in")}
          >
            Checked-in
          </FilterChip>
          <FilterChip
            active={entryStatus === "registered_not_arrived"}
            onClick={() => toggleEntryStatus("registered_not_arrived")}
          >
            Not arrived
          </FilterChip>
        </div>
```
with:
```tsx
        <div className="mb-4 flex flex-wrap gap-3">
          <SegmentedControl
            aria-label="Filter by guest type"
            options={[
              { value: "", label: "All" },
              { value: "walk_in", label: "Walk-in" },
              { value: "pre_registered", label: "Pre-registered" },
            ]}
            value={guestType}
            onValueChange={(v) => {
              setGuestType(v);
              setPage(1);
            }}
          />
          <SegmentedControl
            aria-label="Filter by entry status"
            options={[
              { value: "", label: "All" },
              { value: "checked_in", label: "Checked-in" },
              { value: "registered_not_arrived", label: "Not arrived" },
            ]}
            value={entryStatus}
            onValueChange={(v) => {
              setEntryStatus(v);
              setPage(1);
            }}
          />
        </div>
```

(`cn` is still used elsewhere in the file — keep its import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "segmented filters"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/guests/guests-table.tsx __tests__/components/guests/guests-table.test.tsx
git commit -m "feat(guests): replace filter chips with two SegmentedControls"
```

---

## Task 2: "Checked-in" badge → `--success` token

**Files:**
- Modify: `components/guests/guests-table.tsx`
- Test: `__tests__/components/guests/guests-table.test.tsx`

- [ ] **Step 1: Update the test** — in the test `it("humanizes entry statuses and renders Checked-in distinctly", …)`, change the assertion:
```tsx
    expect(checkedIn.className).toContain("bg-green-600");
```
to:
```tsx
    expect(checkedIn.className).toContain("bg-success");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "renders Checked-in distinctly"`
Expected: FAIL (badge still has `bg-green-600`, not `bg-success`).

- [ ] **Step 3: Edit `components/guests/guests-table.tsx`** — change the checked-in badge:
```tsx
                          <Badge className="bg-green-600 text-white">Checked-in</Badge>
```
to:
```tsx
                          <Badge className="bg-success text-success-foreground">Checked-in</Badge>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "renders Checked-in distinctly"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/guests/guests-table.tsx __tests__/components/guests/guests-table.test.tsx
git commit -m "feat(guests): use success token for the Checked-in badge"
```

---

## Task 3: Empty state → `EmptyState` (+ Clear filters)

**Files:**
- Modify: `components/guests/guests-table.tsx`
- Test: `__tests__/components/guests/guests-table.test.tsx`

- [ ] **Step 1: Add failing tests** — append this `describe` block to `__tests__/components/guests/guests-table.test.tsx`:

```tsx
describe("GuestsTable empty states", () => {
  it("shows the no-registrations EmptyState with no Clear filters button", () => {
    setGuests([], 0);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("No registrations yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows a filtered EmptyState and Clear filters resets the query", () => {
    setGuests([], 0);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(screen.getByText("No matching guests")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mockUseGuests).toHaveBeenLastCalledWith(
      "o",
      "e",
      expect.objectContaining({ guestType: "", entryStatus: "", search: "", page: 1 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "empty states"`
Expected: FAIL (current empty branch renders "No registrations yet." / "No matches." text, not the EmptyState titles).

- [ ] **Step 3: Edit `components/guests/guests-table.tsx`**

(a) Add imports:
```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoGuests } from "@/lib/illustrations";
```

(b) Add a `clearFilters` handler next to the other handlers (e.g. right after `onPageSize`):
```tsx
  const clearFilters = () => {
    setSearch("");
    setGuestType("");
    setEntryStatus("");
    setPage(1);
  };
```

(c) Replace the empty branch:
```tsx
        {guests.data && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {search || guestType || entryStatus ? "No matches." : "No registrations yet."}
          </p>
        )}
```
with:
```tsx
        {guests.data && rows.length === 0 ? (
          search || guestType || entryStatus ? (
            <EmptyState
              illustration={NoGuests}
              title="No matching guests"
              message="Try a different search or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              illustration={NoGuests}
              title="No registrations yet"
              message="Guests appear here as they register or are imported."
            />
          )
        ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "empty states"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/guests/guests-table.tsx __tests__/components/guests/guests-table.test.tsx
git commit -m "feat(guests): EmptyState with Clear-filters for the empty list"
```

---

## Task 4: Search → `Input`, page-size → `Select`

**Files:**
- Modify: `components/guests/guests-table.tsx`
- Test: `__tests__/components/guests/guests-table.test.tsx`

- [ ] **Step 1: Add failing tests** — append this `describe` block:

```tsx
describe("GuestsTable primitive inputs", () => {
  it("uses the Input primitive for search", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 1);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByPlaceholderText("Search name, email, or phone…")).toHaveAttribute(
      "data-slot",
      "input",
    );
  });

  it("uses the Select primitive for rows per page", () => {
    setGuests([guest({ id: "g1", full_name: "Solo" })], 200);
    wrap(<GuestsTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByLabelText("Rows per page")).toHaveAttribute("data-slot", "select");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx -t "primitive inputs"`
Expected: FAIL (the raw `<input>`/`<select>` have no `data-slot`).

- [ ] **Step 3: Edit `components/guests/guests-table.tsx`**

(a) Add imports:
```tsx
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
```

(b) Replace the search input:
```tsx
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-3 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
```
with:
```tsx
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-3 max-w-sm"
        />
```

(c) Replace the rows-per-page `<select>`:
```tsx
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => onPageSize(Number(e.target.value))}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
```
with:
```tsx
                <Select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => onPageSize(Number(e.target.value))}
                  className="w-auto"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx`
Expected: PASS — the new "primitive inputs" tests plus ALL existing tests (page-size value/options/persistence tests still pass because `Select` renders a native `<select>` with the same `id` and label association).

- [ ] **Step 5: Commit**

```bash
git add components/guests/guests-table.tsx __tests__/components/guests/guests-table.test.tsx
git commit -m "feat(guests): adopt Input and Select primitives for search and page size"
```

---

## Task 5: CSV import dialog — token-align the mapping select (class-only)

**Files:**
- Modify: `app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx`

This is a presentational class-only change with no behavior change (the dense per-column mapping `<select>` is intentionally NOT swapped for the full `Select` primitive — `h-9 w-full` + chevron would break the dense preview-header layout). No unit test is added; the dialog has no existing test and asserting Tailwind class strings would be brittle. Verified by grep + the full suite/lint.

- [ ] **Step 1: Edit `csv-import-dialog.tsx`** — change the mapping select's className:
```tsx
                          <select
                            className="mt-1 rounded border px-1 py-0.5 text-[0.7rem]"
```
to:
```tsx
                          <select
                            className="mt-1 rounded-md border border-input bg-transparent px-1 py-0.5 text-[0.7rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
```
Change nothing else (the `value`, `onChange`, `<option>` rendering, and the rest of the dialog stay exactly as-is).

- [ ] **Step 2: Verify**

Run: `pnpm exec vitest run __tests__/components/guests/guests-table.test.tsx` (sanity — unaffected, still green) and:
Run: `grep -n "border-input" "app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx"`
Expected: the mapping select line now contains `border-input` and the focus-ring utilities; no other change.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx"
git commit -m "feat(guests/import): token-align the CSV column-mapping select"
```

---

## Task 6: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green, including the full `guests-table.test.tsx` (updated + new tests).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (the 3 pre-existing `<img>` warnings in `registration-form.tsx` / `info-form.tsx` / `event-presentation-editor.tsx` are unrelated and acceptable); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(guests): format Phase 3 adoption"
```

---

## Self-Review

- **Spec coverage:** §A two SegmentedControls (+ test rewrite) → Task 1; §C success badge → Task 2; §D EmptyState + Clear filters → Task 3; §B Input/Select → Task 4; §E CSV dialog token-align → Task 5; testing/gate → per-task tests + Task 6. Covered. (Tasks are ordered filters → badge → empty → inputs → dialog; spec section letters differ from task order but every section maps to a task.)
- **Placeholder scan:** no TBD/TODO; every code step shows exact find/replace or full code.
- **Type consistency:** SegmentedControl `options` use string `value`s; `value={guestType}`/`{entryStatus}` are `string` state; `onValueChange(v: string)` feeds `setGuestType`/`setEntryStatus`. `clearFilters` resets the same four state setters used elsewhere. The `aria-label` strings ("Filter by guest type" / "Filter by entry status") match between component and test. Badge token `bg-success text-success-foreground` matches the foundation tokens. `Input`/`Select`/`EmptyState`/`SegmentedControl`/`NoGuests` import paths match the merged foundation.
