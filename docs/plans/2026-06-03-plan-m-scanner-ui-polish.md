# Plan M — Scanner pages UI/UX polish (design / spec)

**Date:** 2026-06-03
**Status:** Design approved; implementation plan to follow (`2026-06-03-plan-m-implementation.md`).

## Problem

Three scanner-related issues, plus a shared styling direction:

1. **Enroll page (already-enrolled state):** the "Open Pre-reg scanner" button is oversized and out of place — it should sit side-by-side with "Reset & re-enroll". Also adopt a new primary color `oklch(0.488 0.243 264.376)`.
2. **Enroll warning card:** shows the event **slug** (`eventgate-launch-pilot`) instead of the human event **name**.
3. **Walk-in QR display:** should be glanceable — event title at top, larger capacity digits with a micro-label explaining what they are, and an at-a-glance sense of what the screen is for.
4. **Style reference:** anchor the visual treatment to the supplied OpenAI-billing reference (light theme, rounded cards, soft-tinted warning card with icon + bold heading + muted body + a solid primary CTA, secondary actions as light-gray pill buttons, large bold numerals).

## Decisions (from brainstorming)

- **Theme:** convert to **light**, scoped to **enroll + unlock + walk-in**. Leave scan/escalations dark for now.
- **Primary color:** wire `oklch(0.488 0.243 264.376)` into the **global `--primary`** token (broader blast radius accepted; dashboard primary buttons also change). This color already exists in the system as `.dark` `--sidebar-primary`.
- **Event title:** **plumb from backend** (`Event.name`) — accurate, not lossy slug-humanizing.
- **Gate/Lane:** collapse to a single device-label line (both fields are the same value today).
- **Out of scope:** typography/font changes; converting scan/escalations to light. (Future overall-theme pass.)

## Design

### A. Theme tokens — `frontend/app/globals.css`

- In **both** `:root` and `.dark`:
  - `--primary: oklch(0.488 0.243 264.376);`
  - `--primary-foreground: oklch(0.985 0 0);` (white — legible on the L≈0.49 violet)
- Semantic colors unchanged: **amber** for warnings/"full", **red** for destructive reset.

### B. Shared scanner layout per-page theme — `frontend/app/scanner/layout.tsx`

- Compute `isLight = pathname === "/scanner/enroll" || pathname === "/scanner/unlock"` (exact match — neither route has sub-paths).
- Light routes: wrapper uses `bg-background text-foreground`; header restyled light (light border, foreground text, muted online/offline pills that still read as green/amber).
- Other routes: keep current dark (`bg-neutral-950 text-white`).
- Walk-in display is `fixed inset-0` full-bleed and already overrides the layout — no layout dependency.

### C. Enroll page — `frontend/app/scanner/enroll/page.tsx` (items 1 & 2)

- Page surfaces use light tokens: `bg-background`, `text-foreground`, intro line `text-muted-foreground`.
- **Warning card** (reference-style soft amber): warning-triangle icon + bold heading + muted body. Heading uses the **event name**:
  > This device is already enrolled as **{label}** for **{eventName}**.

  where `eventName = device.event_name ?? device.event_slug` (fallback for pre-existing sessions).
- **Action buttons side-by-side** (flex row, gap):
  - "Open {ROLE_LABELS[role]}" → **primary** (`bg-primary text-primary-foreground`), shown only when `showResume`.
  - "Reset & re-enroll" → **secondary** light-gray pill. When `showResume` is false (helpdesk), it sits alone, left-aligned (not stretched full-width).
- Reset PIN sub-form restyled to light (`border-input`, `bg-background`, foreground text). "Confirm reset" stays **red** (destructive).
- Bottom **"Enroll device"** CTA → **primary** (was `bg-white`, which would disappear on a light page).
- `error` / `resetError` text stays red.

### D. Walk-in display — `frontend/components/scanner/walkin-display.tsx` (item 3)

Props gain `eventName?: string` (passed from the walk-in page via `device.event_name`).

**Ready state** (top → bottom, centered):
1. **Event title** — large, bold (`eventName`, falls back to nothing/slug if absent).
2. **Purpose tag** — one muted line: *"Walk-in registration — scan to enter"*.
3. **QR** — keep ~`max-w-[85vmin]` square, white background, high contrast (unchanged sizing).
4. **Instruction** — *"Scan this code, then enter the hall."*
5. **Capacity counter (enlarged)** — big `{count} / {capacity}` numeral with a small caption beneath: *"Walk-ins registered"*. Rendered only when `showCounter` (capacity configured > 0).
6. **Footer** — single device label, e.g. *Station: {label}* (collapsed from Gate/Lane).

**Full state:** same top-down structure, amber "stop" palette retained: event title, large `{count} / {capacity}`, "Walk-ins are full", "Please direct guests to the help desk.", single station label footer.

### E. Backend + data plumbing — `backend/apps/devices/views.py`

- Enroll response: add `"event_name": device.event.name` to the returned dict.
- Frontend types/storage:
  - `EnrollResponse` (`lib/scanner/api.ts`): add `event_name: string`.
  - `ScannerIdentity` (`lib/scanner/session.ts`): add `event_name: string`.
  - Enroll page `saveDevice({ ... event_name: r.event_name })`.
  - Walk-in page passes `eventName={device.event_name}` to `WalkinDisplay`.
- **Migration edge case:** devices enrolled before this change have no `event_name` in their stored localStorage session. Both consumers fall back to `event_slug` (enroll card) / omit gracefully (walk-in) when `event_name` is absent. No forced re-enroll; devices acquire the real name on next enroll.

### F. Testing

- **Frontend**
  - `__tests__/app/scanner-enroll-page.test.tsx`: assert event **name** rendered (not slug) when present; slug fallback when absent; "Open …" + "Reset & re-enroll" render side-by-side; primary CTA present.
  - New `__tests__/components/scanner/walkin-display.test.tsx`: event title, purpose tag, enlarged counter + caption, single station label, full-state rendering.
  - `__tests__/app/walkin-claim-page.test.tsx`: update only if affected.
- **Backend**
  - Enroll endpoint test asserts response includes `event_name` equal to `Event.name`.

## Acceptance criteria

- [ ] Enroll, unlock, and walk-in pages render in the light theme; scan/escalations unchanged (dark).
- [ ] Primary buttons app-wide use `oklch(0.488 0.243 264.376)` with white text.
- [ ] Enroll warning card shows the human event name (slug fallback for old sessions).
- [ ] "Open …" (primary) and "Reset & re-enroll" (secondary) sit side-by-side; reset alone when resume hidden.
- [ ] Walk-in display: event title on top, purpose tag, enlarged counter with micro-label, single station footer; full state retains amber stop styling.
- [ ] Enroll API returns `event_name`; frontend persists and reads it.
- [ ] Frontend + backend tests pass; lint/format clean.

## Risks / notes

- Global `--primary` change is intentionally broad — dashboard primary buttons change color. Acceptable per decision; flagged for visual sanity-check on the dashboard.
- White-on-violet contrast: L≈0.49 primary with white foreground passes for button-sized text; verify the warning-card amber text remains AA.
