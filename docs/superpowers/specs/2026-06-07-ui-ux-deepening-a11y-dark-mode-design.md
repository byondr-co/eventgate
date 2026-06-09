# UI/UX deepening — a11y + dark-mode (PR1 of a 4-PR program)

> Design spec. Continues the **UI/UX deepening lane** after the monochrome design-system rollout (PRs #60–#67) and skeleton states (#69). **Non-overlapping** with the concurrent Plan M/N lane (pilot reliability + Google Form bridge): this spec touches no data-source/registration-field/CSV/Google-bridge/backend-hardening plumbing.

- **Date**: 2026-06-07
- **Base**: branched off clean `origin/main` (tip `8165a8c`, skeleton PR #69). NOT local main (carries the other lane's unpushed plan-n commits).
- **Pilot opens**: 2026-06-19.

## Goal

Deepen the now-unified UI across four sequenced, independently-shippable PRs. This document covers the **program overview** and **PR1 (a11y + dark-mode) in full depth**. PRs 2–4 are scoped here but get their own spec(-let)+plan cycles when reached.

## Program structure (4 PRs, sequenced)

Ordering is load-bearing: **PR1 establishes the a11y test infra (vitest-axe + @axe-core/playwright) that guards PRs 2–4**, and PR2 reuses PR1's Playwright harness at mobile viewports.

| # | PR | Rationale for position |
|---|----|----|
| 1 | a11y + dark-mode (+ theme toggle, + a11y test infra) | Highest value; lays the axe harness. Fixing **shared primitives** propagates a11y across all ~29 routes at once. |
| 2 | Responsive / mobile QA | Reuses PR1's Playwright harness at phone/tablet viewports; door-staff + attendees are mobile. |
| 3 | Full-page loading wrappers | Mechanical; `Skeleton`/`TableSkeleton` already exist; guarded by PR1's render tests. |
| 4 | Guide-grid step-count fix | Smallest, lowest-risk; lands last. |

Each ships as its own PR. PRs 3–4 are small enough that their "spec" may be a few sentences in their plan.

---

## PR1 — a11y + dark-mode (full design)

### Approach

**Primitives-first, then prioritized page sweep.** Shared primitives are fixed once so a11y improvements propagate everywhere they are used; the page-level sweep then prioritizes pilot-critical routes and spot-checks the rest. Chosen over route-by-route (duplicate findings, slow) and pilot-path-only (leaves admin routes unverified).

**Target standard**: WCAG 2.1 **AA**.

### Component 1 — Theme toggle (light / dark / system)

Dark mode is currently OS-preference-only: `.dark` token block exists in `globals.css`, but no `ThemeProvider` wraps the app. `next-themes@^0.4.6` is already a dependency, and `components/ui/sonner.tsx` already calls `useTheme()` — which silently returns the default `"system"` today because no provider is mounted. Adding the provider both enables the toggle and activates the existing Sonner theming.

- **Provider**: wrap `children` in `next-themes` `ThemeProvider` inside `app/providers.tsx` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`. Keep it inside the existing client `Providers` component (already `"use client"`).
- **Layout**: add `suppressHydrationWarning` to `<html>` in `app/layout.tsx` (documented requirement for `next-themes` with the App Router — the pre-hydration script mutates the class before React hydrates).
- **Component**: `components/common/theme-toggle.tsx`, built on the existing `SegmentedControl` primitive with three options — Light / Dark / System — each with a `currentColor` lucide icon (`SunIcon` / `MoonIcon` / `MonitorIcon`) and a text/`aria-label` so meaning never relies on color or icon alone. Reads/writes via `useTheme()`. Renders a stable placeholder until `mounted` is true to avoid SSR/client value mismatch.
- **Placement**: authenticated app-shell header and the public layout header. **Excluded** from scanner routes (they force their own theme via `app/scanner/layout.tsx`). Exact mount points confirmed during the page sweep.
- **No-flash**: handled by `next-themes` (injects its blocking script). No hand-rolled inline script.

### Component 2 — a11y audit + fixes (WCAG 2.1 AA)

**Primitives (fix once, propagate):** audit each of `Field`, `Input`, `Select`, `Textarea`, `Toggle`, `Slider`, `SegmentedControl`, `Button`, `Dialog`, `EmptyState`, `Badge`, `Breadcrumb` for:

- Accessible name (associated `<label>` / `aria-label` / `aria-labelledby`).
- Keyboard operability + a visible focus indicator (`focus-visible` ring already token-aligned in the design system).
- Correct role/state. `Field` already auto-wires `aria-invalid` / `aria-describedby` (PR #61) — verify it holds and extend if gaps.
- `Dialog`: focus trap, `Esc` to close, focus return to the trigger on close.
- `Toggle` / `SegmentedControl`: correct keyboard semantics (arrow/space/enter) and `aria-pressed`/`role="radiogroup"`-style state as appropriate.
- Dark-mode token contrast (see color note below).

**Page sweep (prioritized):** pilot-critical routes — scanner (`/scanner/*`), public register, walk-in claim + walk-in info, login, organizer dashboard — checked for: one `<h1>` + logical heading order, landmark regions (`main`/`nav`/`header`), sensible focus order, a skip-to-content affordance where navigation precedes content, and form-error association. Remaining admin routes are spot-checked.

**Color/contrast:** failures are fixed at the **token level** in `app/globals.css` (light + `.dark` blocks) so corrections are systemic rather than per-page. Color continues to carry meaning only (success/warning/destructive tokens); contrast fixes must preserve the monochrome-with-semantic-accents design language.

**Intentional exceptions preserved:** the scanner and walk-in-claim confirmation pages stay bold/colored/glanceable — a11y work there is limited to keyboard/name/contrast correctness, not visual redesign.

### Component 3 — Test infra + verification (layered)

- **vitest-axe** (new dev dep): register a `toHaveNoViolations`-style matcher in the existing vitest setup. Add per-primitive a11y tests and a11y assertions to key page-render tests. Fast, runs in the standard `pnpm test` gate. Caveat: jsdom has no layout/computed styles, so it cannot verify color contrast — that is delegated to Playwright.
- **@axe-core/playwright** (new dev dep): extend the existing Playwright e2e (`pnpm test:e2e`). A smoke spec loads pilot-critical routes in **both light and dark themes** and asserts no `serious`/`critical` axe violations (including color-contrast). A keyboard-traversal spec asserts tab order + focus visibility on the register and scanner flows.
- **Gate**: unchanged for the merge gate — `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. The axe e2e runs as its own `test:e2e` step (needs the app booted); documented in the PR, run before merge, not added to the four-command gate.

### Out of scope (PR1)

- Responsive/mobile layout changes (PR2).
- Loading-state skeletons (PR3).
- Guide-grid column logic (PR4).
- Anything in the Plan M/N lane (data sources, registration fields, CSV/Google bridge, backend hardening).
- Visual redesign of the intentional bold/colored exceptions.

### Risks & notes

- **Next.js is non-standard here.** `frontend/AGENTS.md` warns the bundled Next.js has breaking changes vs. training data; the implementer must read the relevant guide under `node_modules/next/dist/docs/` before writing provider/layout code.
- **Hydration**: the `suppressHydrationWarning` + `mounted` guard pattern must be correct or the toggle flickers / warns. Covered by a render test.
- **Token contrast edits** ripple app-wide; the Playwright dual-theme axe sweep is the safety net.
- **Pilot timeline**: PR1 is the must-have before 2026-06-19; PRs 2–4 are desirable-but-deferrable if time tightens.

---

## PRs 2–4 — scoped (detailed in their own cycles)

- **PR2 — Responsive / mobile QA.** Reuse PR1's Playwright harness at 375px (phone) and 768px (tablet) viewports across pilot-critical paths (door-staff scanner, attendee register/walk-in). Fix overflow/tap-target/layout breakage found. No new infra.
- **PR3 — Full-page loading wrappers.** Replace the four bare `Loading…` returns with `Skeleton`/`TableSkeleton`:
  - `components/.../org-list.tsx` (org list)
  - `app/(app)/orgs/[slug]/page.tsx` (org page)
  - `app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (event page)
  - `app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx` (imports detail)
- **PR4 — Guide-grid step-count fix.** `components/common/guide.tsx:18` hardwires `grid sm:grid-cols-2 lg:grid-cols-4`; a 3-step flow renders 2+1. Derive the column count from `steps.length` (cap at 4) so 3-step flows render evenly.

## Process

Per-PR: brainstorm/spec → plan (`docs/plans/`) → subagent-driven TDD execution → spec + quality reviews → independent pre-merge review → PR (as `vineidev`, single-line conventional commits, no `Co-Authored-By`). Gate before each PR: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check` (from `frontend/`, after `nvm use 20`). 3 pre-existing `<img>` lint warnings are accepted.
