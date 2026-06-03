# Design — UI/UX Monochrome Overhaul (OpenAI-console inspired)

**Date:** 2026-06-03
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Goal

Refresh Eventgate's UI/UX into a near black-and-white design language inspired by the
OpenAI platform console: monochrome surfaces with color reserved for meaning, smooth
lucide-matched icons, a balanced type scale, instructive empty states, OpenAI-grade form
components, and black-and-white stroke illustrations that replace text-wall instructions.

The **scanner** (`/scanner/*`) is deliberately **out of scope** — it was polished in Plan M
(#58), the user likes it, and its big/bold/colored scan-confirm screens are the intended
exception to the monochrome direction.

## Approved decisions

| Decision | Choice |
|---|---|
| Palette direction | **A — mono + semantic color**: greyscale UI, near-black primary; color only for success (green = checked-in) and destructive/error (red). |
| Illustration style | **Thin line, lucide-matched** — 1.4px uniform stroke, rounded caps, `stroke="currentColor"`. Hand-authored inline SVG. |
| Form components | Full OpenAI-console-matched kit (inputs, textarea w/ resize grip, select w/ chevron, toggle, slider, segmented control, button hierarchy, uppercase section labels). |
| Empty states | Standard pattern: thin-line icon + title + message + one primary action. |
| Dark mode | **Keep** — retune both light and dark token sets to mono + semantic. Illustrations use `currentColor` so they adapt automatically. |
| Delivery | **Hybrid** — tokens → primitives → page-by-page adoption. |
| Pre-pilot scope | **Full overhaul before pilot** (2026-06-19). Timeline risk flagged below. |

## Stack context

- Next.js 16 (App Router), React 19, Tailwind v4, shadcn, **Base UI** (`@base-ui-components/react`, *not* Radix), `lucide-react`, `next-themes`, `sonner`.
- Theme tokens live in `frontend/app/globals.css` (`:root` + `.dark`, oklch). Font: **Geist** (`frontend/app/layout.tsx`). Existing UI primitives in `frontend/components/ui/` are sparse: `badge, breadcrumb, button, card, dialog, sonner, textarea`.
- Today's forms use raw inline-styled `<label>/<input>/<select>` (see `frontend/components/events/device-create-form.tsx`) and an amber "shown once" callout.

## Section 1 — Design language & tokens

**File:** `frontend/app/globals.css`

- `--primary`: blue-violet `oklch(0.488 0.243 264.376)` → **near-black** `oklch(0.205 0 0)` (light). In `.dark`, `--primary` → near-white (`oklch(0.985 0 0)`) with `--primary-foreground` dark, so primary buttons invert correctly. This single change recolors every primary button, link, active nav item, and focus ring app-wide.
- `--ring`: → near-black (light) / light-grey (dark), paired with a soft 3px focus halo (`box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 12%, transparent)`), applied via the primitives.
- `--sidebar-primary` / sidebar active states: align to near-black (light) so active nav is mono, not violet.
- Semantic colors **kept but quarantined**: `--destructive` (red) only for errors/destructive actions; a `--success` green (new token, e.g. `oklch(0.55 0.13 150)`) only for checked-in/success. No decorative color.
- `--chart-*` already greyscale — leave as-is.
- Replace the amber "shown once" callout styling with a neutral grey code block (uses `--muted`/`--border`).

**Typography & spacing (Tailwind utility conventions, documented in a short style note):**
- Page title `text-2xl font-semibold`; section heading `text-base font-semibold`; body `text-sm`; helper `text-xs text-muted-foreground`.
- New **uppercase section-label** style: `text-xs font-semibold tracking-wide uppercase text-muted-foreground` (the `TOOLS` / `DEVICES` panel labels).
- Controls use `rounded-lg` (≈9px); `--radius` stays `0.625rem`.

## Section 2 — Component primitives

**Location:** `frontend/components/ui/`. Each primitive ships light + dark variants and unit tests. Built on Base UI where an interactive primitive exists (Toggle/Switch, Select, Slider); plain elements otherwise. Use `class-variance-authority` for variants (already a dep), consistent with `button.tsx`.

- **`field.tsx`** — `Field` wraps label + control + optional helper text + inline error message. Owns the `aria-invalid` / `aria-describedby` wiring (preserving the a11y already present in `device-create-form.tsx`). Label is `text-sm font-semibold`; helper `text-xs text-muted-foreground`; error `text-xs text-destructive role="alert"`.
- **`input.tsx`**, **`textarea.tsx`** (upgrade existing; add resize grip affordance), **`select.tsx`** (chevron, Base UI Select) — shared focus-ring treatment.
- **`toggle.tsx`** (switch: black on / grey off), **`slider.tsx`** (black fill + thumb) — Base UI.
- **`segmented-control.tsx`** — replaces the guest-list filter chips (`?guest_type=` filtering stays unchanged; this is a presentational swap).
- **`button.tsx`** (extend) — variants: `primary` (black), `secondary` (grey), `outline`, `ghost`, `danger` (red-outline), `icon`, `pill` (small `+ Files` / `⚙`). Keep existing call sites working (default variant unchanged or migrated in the same PR).
- **`empty-state.tsx`** — `EmptyState` = thin-line icon (illustration) + title + message + primary action. Reused on every blank list.

## Section 3 — Illustration & Guide system

- **`frontend/lib/illustrations/`** — hand-authored thin-line SVG React components (1.4px stroke, rounded caps, `stroke="currentColor"`, no hardcoded fills so dark mode adapts). Each accepts `className`/`size`.
  - Flow art: `DeviceCreate`, `CopyCode`, `OpenEnrollPage`, `EnterPin`, `InstallPWA`, `ScanGuest`, `WalkinInfo`.
  - Empty-state spots: `NoDevices`, `NoGuests`, `NoEvents`, `NoLinks` (and a generic fallback).
- **`components/common/guide.tsx`** — `Guide`/`Steps` renders a numbered flow as illustration + short caption per step. Horizontal on desktop, stacked on mobile. Replaces the `<ol>` instruction list on the devices page (`frontend/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx`).
- **`components/common/install-guide.tsx`** — `InstallGuide` shows the add-to-home-screen illustration with concise iOS-Safari / Android-Chrome steps, surfaced on the scanner enroll entry.

## Section 4 — Surface application plan

Token + primitive changes cascade globally; these pages get explicit adoption passes:

- **Console:** orgs (list, new), events (list, new, settings, form, imports + import detail, audit, links, helpdesk), **devices** (Guide illustrations + form kit + EmptyState), **guests** (SegmentedControl filter, EmptyState, success/neutral status chips), members.
- **Public:** register, info, registered, claim — form kit + empty/confirmation states.
- **Auth:** login, invites — Input/Field kit.
- **Global:** nav/sidebar active states adopt near-black; `sonner` toasts already neutral (verify).

## Section 5 — Scanner (out of scope)

`/scanner/*` stays as-is — big, bold, colored scan / walk-in / confirm / warning screens are the intended exception. It inherits only **token-safe** changes (already on the light theme + brand primary from Plan M); layouts are untouched. The enroll page's **instruction block** adopts the new `Guide` + `InstallGuide`, but the unlock / scan / confirm screens are not modified.

## Section 6 — Testing, risk & rollout

**Testing**
- Primitives: unit tests (Vitest + Testing Library) covering variants, disabled/error states, and the a11y wiring (`aria-invalid`/`aria-describedby`).
- Playwright smoke on devices, guests, and public register after their adoption passes.
- Visual sanity in both light and dark mode for primitives and illustrations.

**Risk (flagged)**
- Full overhaul against a **~16-day** pilot window (pilot opens 2026-06-19) is tight.
- Mitigation: hybrid order lands tokens + primitives first (global win even if late page passes slip); the **scanner is untouched**, so the pilot's critical door-flow carries no regression risk. If time compresses, **page adoption is the safe deferral** — the foundation still ships.

**Rollout (PR sequence)**
1. **Foundation PR** — tokens (light + dark) + primitives (`field`, `input`, `textarea`, `select`, `toggle`, `slider`, `segmented-control`, extended `button`, `empty-state`) + `lib/illustrations/` + `Guide`/`InstallGuide`. Includes the style note and unit tests.
2. **Devices adoption** — Guide illustrations + form kit + EmptyState (the showcase page).
3. **Guests adoption** — SegmentedControl + EmptyState + status chips.
4. **Public register adoption** — form kit + states.
5. **Remaining console + public + auth pages** — in priority order.

Per project conventions: plans in `docs/plans/`; single-line conventional commits; **no `Co-Authored-By` trailer**. PRs created/merged as `vineidev`.

## Out of scope / non-goals

- No scanner layout changes (token inheritance only).
- No backend changes (this is presentational; `?guest_type=` filtering and all APIs unchanged).
- No new color system beyond mono + the two semantic colors (green success, red destructive).
- No font change (Geist stays).
