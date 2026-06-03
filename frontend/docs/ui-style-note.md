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

## Illustrations & guides

- `@/lib/illustrations` — thin-line SVGs (1.4px, rounded, `currentColor`). Use inside `EmptyState` and `Guide`.
- `@/components/common/guide` — `Guide` for numbered instruction flows; `InstallGuide` for PWA add-to-home-screen.

## Scanner

`/scanner/*` is intentionally exempt — big/bold/colored screens stay. It only inherits token-safe changes.
