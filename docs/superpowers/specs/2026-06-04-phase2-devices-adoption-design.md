# Design — Phase 2: Devices Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Goal

Apply the monochrome design-system foundation (PRs #60, #61 — on `main`) to the
devices surface: replace the text-wall instructions with the `Guide` illustration
component, migrate the device-create form to the shared `Field`/`Input`/`Select`
primitives (gaining `Field`'s automatic a11y wiring), replace the inline empty-list
text with the `EmptyState` primitive, align device-status colors to the
mono-+-semantic palette, and do a focused token/`InstallGuide` cleanup of the
scanner enroll page.

This is the first real consumer of the foundation primitives.

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| `/scanner/enroll` | **In scope**, but focused — add `InstallGuide` + token/primitive cleanup only; do NOT restructure the PIN-gated reset/overwrite logic. |
| Device-table empty state | `EmptyState` with illustration + one-line instruction, **no action button**. |
| Admin page instruction Card | Removed — `Guide` renders its own per-step cards (no card-in-card). |

## Foundation building blocks (already on `main`)

- `@/components/ui/field` — `Field` auto-wires `aria-invalid` + `aria-describedby={`${htmlFor}-error`}` onto its single child when `error` is set (pass a single element child; set the control's `id` to match `htmlFor`).
- `@/components/ui/input`, `@/components/ui/select` (native, chevron), `@/components/ui/empty-state`.
- `@/components/common/guide` — `Guide` (numbered illustration flow), `InstallGuide` (PWA add-to-home-screen).
- `@/lib/illustrations` — `DeviceCreate`, `CopyCode`, `OpenEnrollPage`, `EnterPin`, `NoDevices`, `InstallPWA`, etc.
- Tokens: `bg-primary` (near-black), `text-success`/`bg-success` (green semantic), `text-destructive` (red), greyscale elsewhere.

## Section A — Admin devices page

**File:** `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx`

- Remove the `Card`/`CardHeader`/`CardContent` wrapper holding the `<ol className="list-decimal">` instructions.
- Render a section heading "How to set up a device" (`text-base font-semibold`) followed by `<Guide steps={…} />` with four steps:
  1. `DeviceCreate` — **Create a device** — "Pick a role (Pre-reg scanner or Walk-in display) and a clear label like 'Gate 1 Lane A'."
  2. `CopyCode` — **Copy the code** — "Each device gets a one-time enrollment code."
  3. `OpenEnrollPage` — **Open the enrollment page** — "On that phone or tablet, open the enroll page and paste the code."
  4. `EnterPin` — **Enter the event PIN** — "Unlock, and it lands on its scanner or walk-in screen."
- Keep the existing "Open the device enrollment page" link/button (→ `/scanner/enroll`, `target=_blank`) and the small `/scanner/enroll` note directly below the `Guide`. The button already uses `bg-primary`/`text-primary-foreground` — leave it.
- `DeviceCreateForm` and `DeviceTable` render below, unchanged in placement.

## Section B — Device create form

**File:** `frontend/components/events/device-create-form.tsx`

- Replace each raw `<label className="block"><span>…</span><input/select/></label>` with `Field` + the matching primitive:
  - **Label** → `<Field label="Label" htmlFor="device-label" error={fieldErrors.label} helper="Shown on the device and in the audit log.">` wrapping `<Input id="device-label" required value={label} … />`. Field auto-wires `aria-invalid`/`aria-describedby` from `error`; remove the hand-rolled error `<p id="device-label-error">` and manual `aria-invalid`/`aria-describedby` on the input.
  - **Role** → `<Field label="Role" htmlFor="device-role">` wrapping `<Select id="device-role" value={role} …>` with the existing `ROLES` options.
  - **Gate** → `<Field label="Gate" htmlFor="device-gate" optional>` wrapping `<Input id="device-gate" value={gate} … />`. Drop the inline "(optional)" text in favor of Field's `optional` marker.
- Submit button stays `<Button type="submit">` (default = black primary).
- `formError` stays a `<p className="text-sm text-destructive" role="alert">` below the button.
- Replace the amber "shown once" callout (`border-amber-500 bg-amber-50 … text-amber-*`) with a neutral block:
  - container `rounded-lg border bg-muted/40 p-4`
  - label `text-xs font-semibold uppercase tracking-wide text-muted-foreground` reading "Enrollment code · shown once"
  - the code `break-all font-mono text-sm text-foreground`
  - Copy action → `<Button type="button" variant="outline" size="sm">` ("Copied!" / "Copy code")
  - the "paste this on the device…" note `text-xs text-muted-foreground`
- Keep the `Card`/`CardHeader`/`CardTitle`/`CardDescription` wrapper and all mutation/state logic (`useCreateDevice`, `extractFieldErrors`, copy handler) unchanged.

## Section C — Device table

**File:** `frontend/components/events/device-table.tsx`

- Replace the `!data || data.length === 0 ? (<p>No devices yet.</p>)` branch with `<EmptyState illustration={NoDevices} title="No devices yet" message="Create a device above, then open the enrollment page on that device to start scanning guests in." />` (no `action`).
- Update `deviceState()` tones to the palette:
  - Enrolled: `text-green-600` → `text-success`
  - Pending enrollment: `text-amber-600` → `text-muted-foreground`
  - Revoked: `text-destructive` (unchanged)
- Keep the table markup, loading/error states, revoke `confirm()` + outline button, and all data hooks unchanged.

## Section D — Scanner enroll page (focused cleanup)

**File:** `frontend/app/scanner/enroll/page.tsx`

In scope:
- Add `<InstallGuide />` (add-to-home-screen helper) — placed after the intro paragraph, before the "already enrolled" block. This is the device-side instructional addition. The 4-step `Guide` is NOT added here (it is the admin's flow).
- De-amber the callouts to neutral mono cards:
  - "already enrolled" card: `border-amber-200 bg-amber-50` → `border-border bg-muted/40`; the warning `<svg>` icon `text-amber-600` → `text-foreground`; amber text classes → `text-foreground` / `text-muted-foreground`.
  - overwrite-confirm card: `border-amber-300 bg-amber-50` → `border-border bg-muted/40`; its label text → `text-muted-foreground`.
- Replace raw buttons with the `Button` primitive:
  - "Reset & re-enroll" amber button → `<Button variant="outline" size="sm">`.
  - reset "Confirm reset" `bg-red-600` → `<Button variant="destructive" size="sm">`; its "Cancel" → `<Button variant="ghost" size="sm">`.
  - overwrite "Confirm & enroll" `bg-primary` → `<Button>`; its "Cancel" → `<Button variant="ghost">`.
  - error `<p className="text-xs text-red-600">` / `text-sm text-red-600` → `text-destructive`.
- The big bold full-width **"Enroll device"** submit button is left **as-is** (it already uses `bg-primary`/`text-primary-foreground`). It is the scanner's intentional big-bold exception; do NOT convert it to `<Button>` — preserving the raw markup keeps the exact large look and avoids regressions.

Out of scope (do NOT change):
- The reset/overwrite/resume state machine and handlers (`onSubmit`, `onConfirmOverwrite`, `onConfirmReset`, `onResume`, `runEnroll`).
- The bespoke centered mono PIN inputs and the code `<textarea>` behavior (keep their current markup; they already use `border-input`). Token-only touch-ups allowed, no structural change.

## Testing

- **Component tests (Vitest + Testing Library):**
  - `DeviceCreateForm`: renders the three fields; submitting with a server field error shows the inline error AND the input gets `aria-invalid="true"` + `aria-describedby="device-label-error"` (verifies Field auto-wiring through a real form); the enrollment-code block renders the code and a Copy button (no amber classes).
  - `DeviceTable`: empty state renders the `EmptyState` ("No devices yet"); enrolled row uses `text-success`, pending uses `text-muted-foreground`, revoked uses `text-destructive`.
- **Existing tests** for the enroll page (`__tests__/app/scanner-enroll-page.test.tsx`) must continue to pass — adjust selectors only if the de-amber/Button swap changes class-based queries (prefer role/text queries).
- Full suite green; `tsc --noEmit` clean; `pnpm lint` + `pnpm format:check` clean.

## Non-goals

- No backend/API changes; no changes to device data model or hooks.
- No restructuring of the scanner enroll PIN flows.
- No changes to other scanner screens (unlock/scan/walk-in/confirm).
- Other pages (guests, public, auth) are later phases.

## Delivery

Single PR (devices adoption), reviewed via subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`.
