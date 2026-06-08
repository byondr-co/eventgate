# Eventgate UI style note

Monochrome + semantic. Color carries meaning only:

- **Primary** (`bg-primary text-primary-foreground`) — near-black (light) / near-white (dark). Primary buttons, active nav, focus ring.
- **Success** (`bg-success text-success-foreground`) — checked-in / success only.
- **Destructive** (`text-destructive` / destructive button) — errors and destructive actions only.
- Everything else is greyscale (`background`, `card`, `muted`, `border`, `foreground`, `muted-foreground`).

## Type scale

- Page title: `text-2xl font-semibold`
- Section heading: `text-base font-semibold`
- Body: `text-sm`
- Helper / caption: `text-xs text-muted-foreground`
- Section label (panel headers): `text-xs font-semibold uppercase tracking-wide text-muted-foreground`

## Primitives (`@/components/ui`)

`Field`, `Input`, `Textarea`, `Select`, `Toggle`, `Slider`, `SegmentedControl`, `Button` (variants: default/secondary/outline/ghost/destructive/link; sizes incl. `icon`, `pill`), `EmptyState`.

`Field` wraps a single control and, when given an `error`, automatically sets `aria-invalid` + `aria-describedby={`${htmlFor}-error`}` on that child (pass a single element as the child, and set the control's `id` to match `htmlFor`).

## Illustrations & guides

- `@/lib/illustrations` — thin-line SVGs (1.4px, rounded, `currentColor`). Use inside `EmptyState` and `Guide`.
- `@/components/common/guide` — `Guide` for numbered instruction flows; `InstallGuide` for PWA add-to-home-screen.

## Scanner

`/scanner/*` is intentionally exempt — big/bold/colored screens stay. It only inherits token-safe changes.

## Theme & accessibility

- Theme is light / dark / system via `next-themes` (`attribute="class"`, mounted in `app/providers.tsx`; `<html>` carries `suppressHydrationWarning`). The `ThemeToggle` (`@/components/common/theme-toggle`) lives in the authenticated app-shell header. Public, auth, and scanner routes inherit the resolved theme (scanner forces its own); they have no inline switcher because they are one-shot flows.
- a11y target is **WCAG 2.1 AA**. Color carries meaning only; fix contrast at the **token level** in `app/globals.css` (light + `.dark`), never per-page.
- The app shell exposes a skip-to-content link to a focusable `#main` landmark.
- Verification is layered:
  - **Structural a11y** (roles/names/labels/aria) is asserted with `vitest-axe` in unit tests (e.g. `components/ui/__tests__/primitives-a11y.test.tsx`, `dialog-a11y.test.tsx`). jsdom cannot compute color contrast.
  - **Color contrast + keyboard/focus** are asserted in a real browser via `@axe-core/playwright` in `tests/a11y.spec.ts` (dual-theme axe sweep + keyboard traversal). Run with `pnpm test:e2e` — it boots the app, so it is NOT part of the four-command merge gate (`pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`); run it before merging UI changes.
