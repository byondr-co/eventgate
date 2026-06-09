# PR2 — Responsive / mobile QA (design)

**Date:** 2026-06-09
**Program:** UI/UX-deepening lane, PR2 of 4 (after PR1 a11y + dark-mode, #71; CI e2e, #73).
**Status:** Approved design — ready for implementation plan.

## Problem

Door staff and attendees use the pilot-critical paths on phones and tablets, but the
layouts migrated during the monochrome rollout were tuned at desktop width. We need a
focused QA pass that finds and fixes **blocking** responsive defects at mobile/tablet
viewports, plus a durable CI guard so responsive regressions don't reach the pilot
(opens 2026-06-19).

This is a QA-and-fix pass over partially-responsive layouts, **not** a redesign.

## Scope

### Viewports

Verify and fix against **375px** (phone), **768px** (tablet portrait), and **1024px**
(small laptop / tablet landscape).

### Routes (pilot-critical paths + app shell)

- **Public:** register (`/e/[orgSlug]/[eventSlug]/register`), walk-in claim + info
  (`/e/.../claim/[token]`, `/e/.../info/[token]`).
- **Auth:** login (`/login`, via `(auth)/layout.tsx`).
- **Scanner:** `/scanner/*` (enroll, scan, walkin) — intentionally bold/colored/glanceable.
- **Organizer app shell:** the `(app)` header + skip link (`app/(app)/layout.tsx`) and the
  org/event dashboard landing pages.

Deep organizer table pages (guests / imports / members / devices / links) get a
**scroll-sanity check only** — confirm they scroll and don't force page-level overflow.
They are not actively redesigned in PR2.

### What counts as a real finding

**Blocking defects only:**

- Horizontal page overflow (the document is wider than the viewport).
- Clipped, overlapping, or unreachable controls.
- Genuinely tiny or overlapping touch targets — below the WCAG 2.2 AA "Target Size
  (Minimum)" floor of **24px**, or controls packed too close to tap reliably.
- Illegible / overlapping text.

**Note on the 44px comfort target:** the design system's buttons are intentionally
compact (`h-8` = 32px default, `h-9` = 36px largest) — nothing reaches the 44px
*comfort* target from iOS HIG / WCAG 2.1 AAA. Enlarging the whole button system is a
design-system decision, not a responsive-QA fix, and is **out of scope** for PR2. The
finding bar therefore uses the WCAG 2.2 AA 24px *minimum*, which the current buttons
clear. The 44px comfort gap is recorded as an out-of-scope observation in the PR notes.

**Explicitly acceptable (not findings):** cramped-but-usable spacing, dense tables that
scroll horizontally, non-ideal wrapping that remains usable.

### Non-goals

- No redesign of scanner or walk-in-claim — responsive fixes preserve their bold,
  colored, glanceable character.
- No per-page contrast hacks; any shared fixes stay token-level (carry-over from PR1).
- No exhaustive sweep of every migrated route.
- Pixel-perfect tuning at every breakpoint is out of scope.

## Findings & fixes

### F1 — App-shell header overflows at 375px (CONFIRMED, high confidence)

`app/(app)/layout.tsx:26-46` renders a single `flex items-center justify-between` row:
the "Eventgate" brand on the left, and on the right a cluster of `ThemeToggle` + email +
"Sign out". The `ThemeToggle` (`components/common/theme-toggle.tsx`) is a 3-segment
icon+text `SegmentedControl` (Light / Dark / System) that reserves `min-w-[13rem]`
(208px), both for the live control and its SSR placeholder.

At 375px the usable width is ~327px (after `px-6`). The right cluster alone — 208px toggle
+ email + ~70px "Sign out" + gaps — already exceeds that, before the left brand. The
header overflows horizontally.

**Fix:** Make the toggle compact on small screens — icon-only segment labels below `sm:`,
full icon+text at `sm:` and up — and shrink the SSR placeholder width to match the compact
control so there is no hydration jump. Allow the header row to wrap and/or truncate the
email so brand + controls fit at 375px. Keep all three theme options reachable and the
control glanceable; this is a compaction, not a redesign.

### F2 — Page header rows can overflow at 375px (medium-high)

Several pages use `flex items-center justify-between` with a heading + action button and no
`flex-wrap` (e.g. `app/(app)/orgs/[slug]/page.tsx:20`, and likely the event landing / `new`
pages). A long org/event name or button label can push the row past the viewport.

**Fix:** Allow these header rows to wrap (`flex-wrap` + `gap`) or stack title-over-action at
small widths. Apply only where a real overflow is observed at a target viewport.

### F3 — EventTabsNav (low; verify, likely no change)

`components/nav/event-tabs-nav.tsx:67-69` already uses `overflow-x-auto` with a
`mask-image` fade. Verify: the tab strip scrolls by touch, the active tab is reachable
(not permanently hidden under the fade), and the fade does not read as a disabled state.
Change only if a blocking issue is found.

### Scroll-sanity targets (no redesign)

Guests / members / devices / links / events tables already wrap in `overflow-x-auto` with
sticky first/last columns. Confirm each scrolls horizontally inside its container and does
not force the whole page to overflow at 375px. Fix only page-level overflow, if any.

### Public / auth / scanner

These use mobile-first centering (`max-w-md` + `p-*`) and are expected to pass. Verify for
regressions; no changes anticipated.

## Verification design

Layered, mirroring PR1. jsdom cannot measure layout, so overflow is asserted in a real
browser via Playwright. The CI `e2e` job boots only `pnpm dev` (no backend), so the spec
must run backend-free.

### New spec: `tests/responsive.spec.ts`

Loop over viewports `[375, 768, 1024]` × a set of routes. For each (viewport, route):

1. **No horizontal overflow:** assert
   `document.documentElement.scrollWidth <= window.innerWidth + 1` (1px tolerance for
   sub-pixel rounding).
2. **Touch-target floor:** assert the primary CTA of each public/scanner/auth touch flow
   renders at least **24px** in its smaller dimension (WCAG 2.2 AA minimum). This catches
   genuinely broken targets without indicting the compact-by-design button system.

**API stubbing.** The client `apiFetch` uses a relative base (`""`), so client calls hit
the Playwright origin at `/api/v1/...` and are intercepted with a single
`page.route('**/api/v1/**', ...)` router that returns canned JSON by pathname (and a safe
empty default for anything unstubbed). No backend required.

**Backend-free routes** tested directly (no stub needed for layout): `/login`, public
register (renders a real responsive container even in the event-not-found /
registration-closed state), and `/scanner/enroll`.

**App shell (F1):** stub `**/api/v1/auth/me/` with a long email so the real `(app)` header
renders with content, navigate to an `(app)` route, and measure header overflow at 375px.
The shared `(app)/layout.tsx` header renders independently of page data, so a route whose
page body is a simple status line (e.g. the org dashboard showing "Organization not found"
when its org endpoint is unstubbed) is sufficient to exercise F1.

**Org dashboard row (F2):** additionally stub `**/api/v1/orgs/<slug>/` (long org name) so
the `flex justify-between` header row renders, and the events list endpoint (empty page),
then assert no overflow at 375px.

### CI

Add `tests/responsive.spec.ts` to the existing `e2e` job in
`.github/workflows/frontend.yml` **by explicit path** (a bare name filter would also match
the backend-dependent `healthcheck.spec.ts`), the same pattern #73 used for the a11y spec.
The mobile e2e is **not** part of the four-command merge gate
(`pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`) because it boots
the app — run it locally before merging, exactly like the a11y spec.

## Testing approach

TDD: write the responsive Playwright assertions first, watch them fail (they should surface
F1's header overflow at 375px and any F2 row overflows), then apply the minimal responsive
fixes until they pass. Re-run the existing a11y spec (`tests/a11y.spec.ts`) to confirm the
theme-toggle compaction did not regress accessibility (the toggle keeps its
`aria-label="Color theme"` and all three options).

## Process / ops notes

- Branch off latest `origin/main` (9e4092a — includes #71, #73, Plan N). Independent, not
  stacked. Work in a git worktree.
- `source ~/.nvm/nvm.sh && nvm use 20` before pnpm; run from `frontend/`.
- Gate: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. Three
  pre-existing `<img>` lint warnings are accepted.
- Playwright: run by explicit spec path, e.g.
  `pnpm exec playwright test tests/responsive.spec.ts --project=chromium`.
- PRs as `vineidev`; single-line conventional commit, no Co-Authored-By trailer. Delete the
  remote branch after merge (`git push origin --delete <branch>`) — `gh pr merge`'s local
  branch-delete step errors in a worktree.
