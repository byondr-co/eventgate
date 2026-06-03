# Plan M — Scanner UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the scanner enroll/unlock/walk-in pages to a light theme with a new global primary color, show the real event name (not slug) in the enroll warning card, lay the warning-card actions out side-by-side, and make the walk-in QR display glanceable.

**Architecture:** Promote the existing brand violet (`oklch(0.488 0.243 264.376)`, already used as `.dark --sidebar-primary`) to the global `--primary` token. The shared scanner layout themes itself per-route (light for enroll/unlock, dark elsewhere). The event name is plumbed from the backend enroll response into the persisted device identity and read by both the enroll card and the walk-in display, with a slug fallback for sessions enrolled before this change.

**Tech Stack:** Next.js (App Router, custom build — read `node_modules/next/dist/docs/` before touching Next internals), React, Tailwind v4 + shadcn token CSS, Vitest + Testing Library (frontend), Django REST Framework + pytest (backend).

**Conventions (this repo):**
- Commits: single-line conventional-commit subject, **no body, no `Co-Authored-By` trailer**.
- Frontend tests/lint: run with Node 20 — `nvm use 20` first. `pnpm test`, `pnpm lint`.
- Backend tests: Postgres must be up — `docker start eventgate-postgres-1` first. Run `pytest` from `backend/`.
- Pre-commit hooks (ruff, eslint, prettier, mypy, whitespace) may rewrite files; if so, re-stage and re-commit. Never `--no-verify`.

---

## File Structure

**Backend**
- Modify: `backend/apps/devices/views.py` (enroll response — add `event_name`)
- Test: `backend/tests/test_devices_enrollment.py` (assert `event_name` returned)

**Frontend — types & storage**
- Modify: `frontend/lib/scanner/api.ts` (`EnrollResponse.event_name`)
- Modify: `frontend/lib/scanner/session.ts` (`ScannerIdentity.event_name?`)

**Frontend — theme**
- Modify: `frontend/app/globals.css` (global `--primary` / `--primary-foreground`)
- Modify: `frontend/app/scanner/layout.tsx` (per-route light/dark)

**Frontend — pages/components**
- Modify: `frontend/app/scanner/enroll/page.tsx` (light theme, event name, side-by-side buttons, primary CTAs)
- Modify: `frontend/components/scanner/walkin-display.tsx` (glanceable layout, `eventName`, single station label, flexing QR)
- Modify: `frontend/app/scanner/walkin/page.tsx` (pass `eventName`, drop `gate` prop)
- Test: `frontend/__tests__/app/scanner-enroll-page.test.tsx` (event name + fallback)
- Create: `frontend/__tests__/components/scanner/walkin-display.test.tsx` (new component test)

---

## Task 1: Backend — return `event_name` from enroll

**Files:**
- Modify: `backend/apps/devices/views.py:85-95`
- Test: `backend/tests/test_devices_enrollment.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_devices_enrollment.py` (the `setup` fixture creates `Event(name="E", slug="e")`):

```python
def test_enroll_returns_event_name(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"},
        format="json",
    )
    code = r.data["enrollment_code"]
    anon = APIClient()
    r2 = anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    assert r2.status_code == 200
    assert r2.data["event_name"] == event.name
    assert r2.data["event_slug"] == event.slug
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker start eventgate-postgres-1
cd backend && pytest tests/test_devices_enrollment.py::test_enroll_returns_event_name -q
```
Expected: FAIL — `KeyError: 'event_name'`.

- [ ] **Step 3: Add `event_name` to the enroll response**

In `backend/apps/devices/views.py`, the `DeviceEnrollView.post` response dict (currently lines 85-95) — add the `event_name` key:

```python
        return Response(
            {
                "device_id": str(device.id),
                "device_token": device_token,
                "event_id": str(device.event_id),
                "event_slug": device.event.slug,
                "event_name": device.event.name,
                "org_slug": device.organization.slug,
                "label": device.label,
                "role": device.role,
            }
        )
```

Also update the docstring line 68 to include `event_name`:

```python
    """POST /api/v1/devices/enroll/  {"enrollment_code": "..."}
    -> {device_id, device_token, event_id, event_slug, event_name, org_slug, label, role}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_devices_enrollment.py -q
```
Expected: PASS (all enrollment tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/devices/views.py backend/tests/test_devices_enrollment.py
git commit -m "feat(devices): return event_name from enroll response"
```

---

## Task 2: Frontend — thread `event_name` through types & storage

**Files:**
- Modify: `frontend/lib/scanner/api.ts:11-19`
- Modify: `frontend/lib/scanner/session.ts:29-37`

No new test here — this is a type/storage change consumed (and tested) by Tasks 5 & 6. `event_name` is **optional** on the stored identity so sessions enrolled before Task 1 (which lack the field) remain valid; consumers fall back to the slug.

- [ ] **Step 1: Add `event_name` to `EnrollResponse`**

In `frontend/lib/scanner/api.ts`, the `EnrollResponse` type:

```ts
export type EnrollResponse = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  event_name: string;
  org_slug: string;
  label: string;
  role: "scanner" | "walkin_display" | "helpdesk";
};
```

- [ ] **Step 2: Add optional `event_name` to `ScannerIdentity`**

In `frontend/lib/scanner/session.ts`, the `ScannerIdentity` type:

```ts
export type ScannerIdentity = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  /** Human event name. Optional: sessions enrolled before Plan M lack it; consumers fall back to event_slug. */
  event_name?: string;
  org_slug: string;
  label: string;
  role: ScannerRole;
};
```

- [ ] **Step 3: Verify type-check passes**

```bash
nvm use 20
cd frontend && pnpm exec tsc --noEmit
```
Expected: no errors. (The enroll page's `saveDevice({...})` call is updated in Task 5; until then `tsc` still passes because `event_name` is optional on `ScannerIdentity` and the new `EnrollResponse.event_name` field is simply unused.)

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/scanner/api.ts frontend/lib/scanner/session.ts
git commit -m "feat(scanner): add event_name to enroll response + device identity types"
```

---

## Task 3: Frontend — promote brand violet to global `--primary`

**Files:**
- Modify: `frontend/app/globals.css:58-59` (`:root`) and `:93-94` (`.dark`)

No unit test (CSS tokens); verified by build + visual.

- [ ] **Step 1: Update `:root` primary**

In `frontend/app/globals.css`, inside `:root` change the two primary lines from:

```css
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
```
to:
```css
  --primary: oklch(0.488 0.243 264.376);
  --primary-foreground: oklch(0.985 0 0);
```

- [ ] **Step 2: Update `.dark` primary**

In the `.dark` block change:

```css
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
```
to:
```css
  --primary: oklch(0.488 0.243 264.376);
  --primary-foreground: oklch(0.985 0 0);
```

- [ ] **Step 3: Verify the build compiles the CSS**

```bash
cd frontend && pnpm exec next build
```
Expected: build succeeds. (Or, if a full build is too slow in the loop, run `pnpm lint` and confirm the file has no stray syntax — the visual check happens during manual verification at the end.)

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(theme): promote brand violet oklch(0.488 0.243 264.376) to global --primary"
```

---

## Task 4: Frontend — scanner layout themes per route

**Files:**
- Modify: `frontend/app/scanner/layout.tsx`

The shared layout currently hard-codes dark (`bg-neutral-950 text-white`). Make enroll + unlock light; keep scan/escalations dark. No unit test for the layout (it wires service-worker/sync side effects); verified by `tsc` + manual.

- [ ] **Step 1: Import the `cn` helper**

At the top of `frontend/app/scanner/layout.tsx`, add to the imports:

```ts
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Compute the per-route theme flag**

Inside `ScannerLayout`, after the existing `const pathname = usePathname() ?? "";` line, add:

```ts
  // Enroll + unlock adopt the light theme (Plan M). Scan/escalations stay dark.
  const isLight = pathname === "/scanner/enroll" || pathname === "/scanner/unlock";
```

- [ ] **Step 3: Apply the theme to the wrapper + header**

Replace the returned wrapper `<div>` and `<header>` opening tags. Change:

```tsx
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span className="font-mono">Eventgate Scanner</span>
```
to:
```tsx
    <div className={cn("min-h-screen", isLight ? "bg-background text-foreground" : "bg-neutral-950 text-white")}>
      <header
        className={cn(
          "flex items-center justify-between border-b px-4 py-2 text-xs",
          isLight ? "border-neutral-200" : "border-neutral-800",
        )}
      >
        <span className="font-mono">Eventgate Scanner</span>
```

Then update the online/offline status span so green/amber stay legible on white. Change:

```tsx
          <span
            className={online ? "font-mono text-green-400" : "font-mono text-amber-400"}
            aria-live="polite"
          >
```
to:
```tsx
          <span
            className={cn(
              "font-mono",
              online
                ? isLight
                  ? "text-green-600"
                  : "text-green-400"
                : isLight
                  ? "text-amber-600"
                  : "text-amber-400",
            )}
            aria-live="polite"
          >
```

- [ ] **Step 4: Verify type-check passes**

```bash
cd frontend && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/scanner/layout.tsx
git commit -m "feat(scanner): light theme for enroll/unlock routes in shared layout"
```

---

## Task 5: Frontend — enroll page redesign (light, event name, side-by-side actions)

**Files:**
- Modify: `frontend/app/scanner/enroll/page.tsx`
- Test: `frontend/__tests__/app/scanner-enroll-page.test.tsx`

- [ ] **Step 1: Write/extend the failing tests**

Add two tests to `frontend/__tests__/app/scanner-enroll-page.test.tsx` (inside the existing `describe` block). The first asserts the human event name renders; the second asserts the slug fallback for pre-Plan-M sessions:

```ts
  it("shows the human event name in the warning card when present", () => {
    mockUseDevice.mockReturnValue({ ...DEVICE, event_name: "Launch Pilot" });
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    expect(screen.getByText("Launch Pilot")).toBeInTheDocument();
    expect(screen.queryByText("launch")).not.toBeInTheDocument();
  });

  it("falls back to the slug when no event_name is stored", () => {
    mockUseDevice.mockReturnValue(DEVICE); // DEVICE has event_slug "launch", no event_name
    mockLoadSession.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    expect(screen.getByText("launch")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
nvm use 20
cd frontend && pnpm test -- scanner-enroll-page
```
Expected: the two new tests FAIL (current card renders `Gate A (launch)`, so "Launch Pilot" is absent and "launch" appears only inside the parenthesised slug — the first new test fails on the missing name).

- [ ] **Step 3: Persist `event_name` on enroll**

In `frontend/app/scanner/enroll/page.tsx`, in `onSubmit`, add `event_name` to the `saveDevice({...})` call (after `event_slug: r.event_slug,`):

```ts
      saveDevice({
        device_id: r.device_id,
        device_token: r.device_token,
        event_id: r.event_id,
        event_slug: r.event_slug,
        event_name: r.event_name,
        org_slug: r.org_slug,
        label: r.label,
        role: r.role,
      });
```

- [ ] **Step 4: Derive the display name + replace the warning card markup**

Replace the line:

```ts
  const alreadyEnrolled = device ? `${device.label} (${device.event_slug})` : null;
```
with:
```ts
  const eventName = device ? (device.event_name ?? device.event_slug) : null;
```

Then replace the entire `{alreadyEnrolled && !busy ? (...) : null}` block with the light-themed card below. It uses an inline warning-triangle SVG (no new dependency), shows the event name, and lays "Open …" (primary) + "Reset & re-enroll" (secondary) side-by-side, with the PIN form dropping full-width below:

```tsx
      {device && !busy ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex gap-3">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="font-medium text-amber-900">
                This device is already enrolled as{" "}
                <span className="font-mono">{device.label}</span> for{" "}
                <span className="font-semibold">{eventName}</span>.
              </p>
              <p className="mt-1 text-amber-800/80">
                Enrolling again will overwrite the existing token. Reset first if that&apos;s
                intentional.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {showResume ? (
              <button
                type="button"
                onClick={onResume}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Open {ROLE_LABELS[device.role]}
              </button>
            ) : null}

            {!resetting ? (
              <button
                type="button"
                onClick={() => setResetting(true)}
                className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Reset &amp; re-enroll
              </button>
            ) : null}
          </div>

          {resetting ? (
            <form onSubmit={onConfirmReset} className="mt-3 space-y-2">
              <label className="block">
                <span className="text-xs text-amber-800/80">Enter the event PIN to reset</span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.4em]"
                  placeholder="• • • •"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetBusy || !resetPin}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {resetBusy ? "Verifying…" : "Confirm reset"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetting(false);
                    setResetPin("");
                    setResetError(null);
                  }}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  Cancel
                </button>
              </div>
              {resetError ? <p className="text-xs text-red-600">{resetError}</p> : null}
            </form>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 5: Light-theme the intro text, code input, and bottom CTA**

In the same file, update the remaining hard-coded dark utility classes:

Intro paragraph — change `text-neutral-400` to `text-muted-foreground`:
```tsx
      <p className="mt-2 text-sm text-muted-foreground">
        Paste the one-time enrollment code your event organizer gave you. The device will bind to
        that event until revoked.
      </p>
```

The enrollment-code `<textarea>` — change `border-neutral-700 bg-neutral-900` to token classes:
```tsx
          <textarea
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={3}
            placeholder="Paste here"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm break-all"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
```

The bottom "Enroll device" `<button>` — change `bg-white ... text-neutral-950` to primary:
```tsx
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Enrolling…" : "Enroll device"}
        </button>
```

The submit-error paragraph — change `text-red-400` to `text-red-600`:
```tsx
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
```

- [ ] **Step 6: Run the enroll tests to verify they pass**

```bash
cd frontend && pnpm test -- scanner-enroll-page
```
Expected: PASS — including the two new tests and the four existing ones (resume button name `Open Walk-in display`, reset flow, wrong-PIN flow all still match).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/scanner/enroll/page.tsx frontend/__tests__/app/scanner-enroll-page.test.tsx
git commit -m "feat(scanner/enroll): light theme, event name in warning card, side-by-side actions"
```

---

## Task 6: Frontend — walk-in display glanceable redesign

**Files:**
- Modify: `frontend/components/scanner/walkin-display.tsx`
- Modify: `frontend/app/scanner/walkin/page.tsx`
- Create: `frontend/__tests__/components/scanner/walkin-display.test.tsx`

Design note: the QR no longer uses a fixed `85vmin`. It flexes (`flex-1 min-h-0`, capped at `max-w-[85vmin]`, kept square) so the new event title above and enlarged counter below always fit on a landscape tablet — the QR stays as large as the remaining vertical space allows. The redundant `gate` prop is removed; a single `scanner` (station) label remains.

- [ ] **Step 1: Write the failing component test**

Create `frontend/__tests__/components/scanner/walkin-display.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalkinDisplay } from "@/components/scanner/walkin-display";

describe("WalkinDisplay — ready", () => {
  it("shows event title, purpose tag, enlarged counter with caption, and station label", () => {
    render(
      <WalkinDisplay
        claimUrl="https://example.test/claim/abc"
        scanner="Gate A"
        eventName="Launch Pilot"
        walkinCount={42}
        walkinCapacity={200}
      />,
    );
    expect(screen.getByText("Launch Pilot")).toBeInTheDocument();
    expect(screen.getByText(/Walk-in registration/)).toBeInTheDocument();
    expect(screen.getByText("42 / 200")).toBeInTheDocument();
    expect(screen.getByText("Walk-ins registered")).toBeInTheDocument();
    expect(screen.getByText(/Gate A/)).toBeInTheDocument();
  });

  it("omits the counter when no capacity is configured", () => {
    render(<WalkinDisplay claimUrl="https://example.test/claim/abc" scanner="Gate A" eventName="E" />);
    expect(screen.queryByText("Walk-ins registered")).not.toBeInTheDocument();
  });
});

describe("WalkinDisplay — full", () => {
  it("renders the stop state with the count and station label", () => {
    render(
      <WalkinDisplay
        kind="full"
        scanner="Gate A"
        eventName="Launch Pilot"
        walkinCount={200}
        walkinCapacity={200}
      />,
    );
    expect(screen.getByText("Walk-ins are full")).toBeInTheDocument();
    expect(screen.getByText("200 / 200")).toBeInTheDocument();
    expect(screen.getByText(/Gate A/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
nvm use 20
cd frontend && pnpm test -- walkin-display
```
Expected: FAIL — `WalkinDisplay` does not yet accept `eventName`, and "Walk-in registration" / "Walk-ins registered" text is absent.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `frontend/components/scanner/walkin-display.tsx`:

```tsx
"use client";

import { QRCodeSVG } from "qrcode.react";

type ReadyProps = {
  kind?: "ready";
  claimUrl: string;
  scanner: string;
  eventName?: string;
  walkinCount?: number;
  walkinCapacity?: number;
};

type FullProps = {
  kind: "full";
  scanner: string;
  eventName?: string;
  walkinCount: number;
  walkinCapacity: number;
};

type Props = ReadyProps | FullProps;

/** Full-bleed walk-in QR display.
 *
 *  Lives on a tablet in landscape orientation. The QR flexes to fill the
 *  vertical space left by the event title (top) and the capacity counter
 *  (bottom), capped at ~85% of the shorter screen dimension, so a phone
 *  camera can still read it from across a small table.
 *
 *  When the event's `walkin_capacity` is reached, the API returns a `full`
 *  state instead of a QR — we render an alternate stop screen so the greeter
 *  knows to halt the line.
 */
export function WalkinDisplay(props: Props) {
  if (props.kind === "full") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-amber-50 px-6 text-amber-950">
        {props.eventName ? (
          <h1 className="text-center text-3xl font-bold leading-tight">{props.eventName}</h1>
        ) : null}
        <div className="text-center">
          <p className="text-5xl font-semibold">Walk-ins are full</p>
          <p className="mt-6 font-mono text-3xl tabular-nums">
            {`${props.walkinCount} / ${props.walkinCapacity}`}
          </p>
          <p className="mt-8 text-lg text-amber-800">Please direct guests to the help desk.</p>
        </div>
        <p className="text-center text-sm text-amber-700">
          Station: <span className="font-mono">{props.scanner}</span>
        </p>
      </div>
    );
  }

  const showCounter =
    typeof props.walkinCapacity === "number" &&
    props.walkinCapacity > 0 &&
    typeof props.walkinCount === "number";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-white px-6 py-6 text-neutral-950">
      <div className="shrink-0 text-center">
        {props.eventName ? (
          <h1 className="text-3xl font-bold leading-tight">{props.eventName}</h1>
        ) : null}
        <p className="mt-1 text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Walk-in registration — scan to enter
        </p>
      </div>

      <div className="flex aspect-square min-h-0 w-full max-w-[85vmin] flex-1 items-center justify-center rounded-2xl bg-white p-4 shadow-xl">
        <QRCodeSVG
          value={props.claimUrl}
          // size in pixels — high base value; CSS scales it to fit.
          size={2048}
          level="M"
          className="h-full w-full"
        />
      </div>

      <div className="shrink-0 text-center">
        <p className="text-lg text-neutral-700">Scan this code, then enter the hall.</p>
        {showCounter ? (
          <div className="mt-3">
            <p className="font-mono text-4xl font-semibold tabular-nums">
              {`${props.walkinCount} / ${props.walkinCapacity}`}
            </p>
            <p className="mt-0.5 text-xs tracking-wide text-neutral-500 uppercase">
              Walk-ins registered
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-neutral-500">
          Station: <span className="font-mono">{props.scanner}</span>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the walk-in page to pass `eventName` and drop `gate`**

In `frontend/app/scanner/walkin/page.tsx`, the two `<WalkinDisplay>` render sites (the `full` branch ~lines 100-109 and the ready branch ~lines 112-120). Remove the `gate={...}` prop and add `eventName={device.event_name}`. The `full` branch becomes:

```tsx
  if (data.status === "full") {
    return (
      <WalkinDisplay
        kind="full"
        scanner={device.label}
        eventName={device.event_name}
        walkinCount={data.walkin_count}
        walkinCapacity={data.walkin_capacity}
      />
    );
  }

  return (
    <WalkinDisplay
      claimUrl={data.claim_url}
      scanner={device.label}
      eventName={device.event_name}
      walkinCount={data.walkin_count}
      walkinCapacity={data.walkin_capacity}
    />
  );
```

Note: leave the `postWalkinDisplayNext({ gate, scanner_label: scannerLabel })` API call and its `const gate = device.label;` line unchanged — the backend endpoint still expects `gate` + `scanner_label`. Only the display-component props change.

- [ ] **Step 5: Run the component test to verify it passes**

```bash
cd frontend && pnpm test -- walkin-display
```
Expected: PASS (all three tests).

- [ ] **Step 6: Verify type-check + full frontend suite**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm test
```
Expected: no type errors; full Vitest suite passes (confirms the `gate`-prop removal didn't break `walkin-claim-page` or others).

- [ ] **Step 7: Commit**

```bash
git add frontend/components/scanner/walkin-display.tsx frontend/app/scanner/walkin/page.tsx frontend/__tests__/components/scanner/walkin-display.test.tsx
git commit -m "feat(scanner/walkin): glanceable display — event title, enlarged counter, single station label"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full backend suite**

```bash
docker start eventgate-postgres-1
cd backend && pytest -q
```
Expected: PASS.

- [ ] **Step 2: Full frontend suite + lint**

```bash
nvm use 20
cd frontend && pnpm test && pnpm lint
```
Expected: tests PASS, lint clean.

- [ ] **Step 3: Manual visual check (light theme + primary color)**

Run the frontend dev server and confirm in a browser:
- `/scanner/enroll` (with a device enrolled): light background, amber warning card shows the **event name**, "Open …" (violet primary) + "Reset & re-enroll" (amber pill) side-by-side, "Enroll device" CTA is violet.
- `/scanner/unlock`: light theme, header light.
- `/scanner/walkin`: event title on top, purpose tag, large QR, enlarged counter with "Walk-ins registered" caption, single "Station:" footer.
- A dashboard page (e.g. an org events page): primary buttons are now violet — sanity-check nothing looks broken.

```bash
cd frontend && pnpm dev
```

- [ ] **Step 4: Confirm no stray dark classes remain on the converted pages**

```bash
cd frontend && grep -nE "bg-neutral-9|text-neutral-400|text-white|bg-white px-4 py-3" app/scanner/enroll/page.tsx
```
Expected: no matches (the enroll page is fully tokenized/light). `walkin-display.tsx` intentionally keeps `bg-white` for QR contrast — do not flag those.

---

## Self-Review Notes (author)

- **Spec coverage:** item 1 (side-by-side + new primary) → Tasks 3, 5; item 2 (event name) → Tasks 1, 2, 5; item 3 (glanceable walk-in) → Task 6; item 4 (reference styling / light theme) → Tasks 3, 4, 5, 6. Light scope = enroll/unlock/walk-in (Task 4 leaves scan/escalations dark). ✅
- **Type consistency:** `EnrollResponse.event_name: string` (required, backend always sends) vs `ScannerIdentity.event_name?: string` (optional, for pre-Plan-M sessions) is deliberate — documented in Task 2. `WalkinDisplay` props drop `gate`, keep `scanner` + add `eventName?`; walk-in page updated to match (Task 6). Counter strings use template literals so Testing Library `getByText` matches a single text node.
- **Deviation from spec:** spec said "keep ~85vmin" for the QR; implementation flexes it (capped at 85vmin) so the added title/counter fit on one screen. Documented in Task 6.
