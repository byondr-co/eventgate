# Phase 2 — Devices Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the monochrome design-system foundation to the devices surface — `Guide` illustrations replace the admin instructions, the device-create form moves to `Field`/`Input`/`Select` (gaining auto a11y wiring), the device table gets an `EmptyState` and palette-aligned status colors, and the scanner enroll page gets a focused `InstallGuide` + de-amber + `Button` cleanup.

**Architecture:** Pure frontend, presentational. Swap existing markup for the already-merged primitives (`@/components/ui/*`, `@/components/common/guide`, `@/lib/illustrations`). No backend, data-model, hook, or enroll-flow-logic changes. The big-bold scanner screens stay; only the enroll page's instructions/callouts/buttons are touched.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test` (= `vitest run`); single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase2-devices-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. The pre-commit hook runs eslint/prettier on staged files — if it reformats, re-add and commit. Work on branch `claude/phase2-devices-adoption` (already created off `main`).

## File Structure

**Modified:**
- `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx` — instructions → `Guide`.
- `frontend/components/events/device-create-form.tsx` — fields → `Field`/`Input`/`Select`; amber code block → neutral.
- `frontend/components/events/device-table.tsx` — empty → `EmptyState`; status tones → palette.
- `frontend/app/scanner/enroll/page.tsx` — `InstallGuide` + de-amber + `Button` swaps.

**Tests created/modified:**
- Create `frontend/__tests__/app/devices-page.test.tsx`
- Modify `frontend/__tests__/components/events/device-create-form.test.tsx`
- Create `frontend/__tests__/components/events/device-table.test.tsx`
- Modify `frontend/__tests__/app/scanner-enroll-page.test.tsx`

---

## Task 1: Admin devices page → `Guide`

**Files:**
- Modify: `app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx`
- Test: `__tests__/app/devices-page.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/devices-page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "o", eventSlug: "e" }),
}));
vi.mock("@/components/events/device-create-form", () => ({
  DeviceCreateForm: () => <div data-testid="create-form" />,
}));
vi.mock("@/components/events/device-table", () => ({
  DeviceTable: () => <div data-testid="device-table" />,
}));

import EventDevicesPage from "@/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page";

describe("EventDevicesPage setup guide", () => {
  it("renders the four setup steps as a numbered guide", () => {
    render(<EventDevicesPage />);
    expect(screen.getByText("Create a device")).toBeInTheDocument();
    expect(screen.getByText("Copy the code")).toBeInTheDocument();
    expect(screen.getByText("Open the enrollment page")).toBeInTheDocument();
    expect(screen.getByText("Enter the event PIN")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("no longer renders the old decimal instruction list", () => {
    const { container } = render(<EventDevicesPage />);
    expect(container.querySelector("ol.list-decimal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/app/devices-page.test.tsx`
Expected: FAIL (old page renders `ol.list-decimal`, not the step titles).

- [ ] **Step 3: Replace the page** — overwrite `app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx` with:

```tsx
"use client";

import { SmartphoneIcon } from "lucide-react";
import { useParams } from "next/navigation";

import { Guide, type GuideStep } from "@/components/common/guide";
import { DeviceCreateForm } from "@/components/events/device-create-form";
import { DeviceTable } from "@/components/events/device-table";
import { CopyCode, DeviceCreate, EnterPin, OpenEnrollPage } from "@/lib/illustrations";

const SETUP_STEPS: GuideStep[] = [
  {
    illustration: DeviceCreate,
    title: "Create a device",
    body: "Pick a role (Pre-reg scanner or Walk-in display) and a clear label like “Gate 1 Lane A”.",
  },
  {
    illustration: CopyCode,
    title: "Copy the code",
    body: "Each device gets a one-time enrollment code.",
  },
  {
    illustration: OpenEnrollPage,
    title: "Open the enrollment page",
    body: "On that phone or tablet, open the enroll page and paste the code.",
  },
  {
    illustration: EnterPin,
    title: "Enter the event PIN",
    body: "Unlock, and it lands on its scanner or walk-in screen.",
  },
];

export default function EventDevicesPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scanner devices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each phone or tablet at the door enrolls once with a one-time code, then unlocks with the
          event PIN.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">How to set up a device</h2>
        <Guide steps={SETUP_STEPS} />
        <div className="space-y-1.5">
          <a
            href="/scanner/enroll"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <SmartphoneIcon className="size-4" />
            Open the device enrollment page
          </a>
          <p className="text-xs text-muted-foreground">
            Opens <span className="font-mono">/scanner/enroll</span> in a new tab — best done on the
            device itself. If you lose a code, revoke the device and create a new one.
          </p>
        </div>
      </section>

      <DeviceCreateForm orgSlug={slug} eventSlug={eventSlug} />
      <DeviceTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

(The `Card` import is dropped. The step `body` strings are JS string values rendered via `{step.body}`, so the curly quotes are not JSX text and do not trip `react/no-unescaped-entities`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/app/devices-page.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx" __tests__/app/devices-page.test.tsx
git commit -m "feat(devices): replace setup instructions with Guide illustrations"
```

---

## Task 2: Device create form → `Field`/`Input`/`Select` + neutral code block

**Files:**
- Modify: `components/events/device-create-form.tsx`
- Test: `__tests__/components/events/device-create-form.test.tsx`

- [ ] **Step 1: Add failing tests** — append two `it` blocks inside the existing `describe("DeviceCreateForm error handling", …)` in `__tests__/components/events/device-create-form.test.tsx` (keep the existing test). Add these:

```tsx
  it("wires aria-invalid and aria-describedby onto the label input on field error", async () => {
    const err = new Error('400 : {"label":["A device with this label and role already exists."]}');
    mockUseCreateDevice.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(err),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateDevice>);

    render(<DeviceCreateForm orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Gate 1 Lane A"), {
      target: { value: "Gate A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create device/ }));

    const input = await screen.findByPlaceholderText("e.g. Gate 1 Lane A");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAttribute("aria-describedby", "device-label-error");
  });

  it("shows the enrollment code with a copy button and no amber styling", async () => {
    mockUseCreateDevice.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ enrollment_code: "EG-7H2K-9QX4-MN03" }),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateDevice>);

    const { container } = render(<DeviceCreateForm orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Gate 1 Lane A"), {
      target: { value: "Gate A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create device/ }));

    await waitFor(() => expect(screen.getByText("EG-7H2K-9QX4-MN03")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
    expect(container.querySelector('[class*="amber"]')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/device-create-form.test.tsx`
Expected: FAIL (current input has no auto `aria-describedby`; code callout still uses amber).

- [ ] **Step 3: Replace the form** — overwrite `components/events/device-create-form.tsx` with (logic unchanged; JSX migrated):

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { extractFieldErrors } from "@/lib/api";
import { useCreateDevice, type DeviceRole } from "@/lib/devices";

type Props = { orgSlug: string; eventSlug: string };

type RoleOption = { value: DeviceRole; label: string };
const ROLES: RoleOption[] = [
  { value: "scanner", label: "Pre-reg scanner" },
  { value: "walkin_display", label: "Walk-in display" },
  { value: "helpdesk", label: "Help desk (reserved)" },
];

export function DeviceCreateForm({ orgSlug, eventSlug }: Props) {
  const create = useCreateDevice(orgSlug, eventSlug);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<DeviceRole>("scanner");
  const [gate, setGate] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setCode(null);
    try {
      const r = await create.mutateAsync({ label, role, gate: gate || undefined });
      setCode(r.enrollment_code);
      setLabel("");
      setGate("");
    } catch (err) {
      const { fieldErrors: fe, formError: fe2 } = extractFieldErrors(err);
      setFieldErrors(fe);
      setFormError(fe2);
    }
  };

  const onCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enroll a new device</CardTitle>
        <CardDescription>
          Each device gets a one-time enrollment code. Paste it into the scanner PWA on the device
          itself to exchange it for a durable token.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <Field
            label="Label"
            htmlFor="device-label"
            error={fieldErrors.label}
            helper="Shown on the device and in the audit log."
          >
            <Input
              id="device-label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Gate 1 Lane A"
            />
          </Field>

          <Field label="Role" htmlFor="device-role">
            <Select
              id="device-role"
              value={role}
              onChange={(e) => setRole(e.target.value as DeviceRole)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Gate" htmlFor="device-gate" optional>
            <Input
              id="device-gate"
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              placeholder="e.g. Gate 1"
            />
          </Field>

          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create device"}
          </Button>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </form>

        {code && (
          <div className="mt-6 rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Enrollment code · shown once
            </p>
            <p className="mt-2 font-mono text-sm break-all text-foreground">{code}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onCopy}>
              {copied ? "Copied!" : "Copy code"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Paste this on the device at <span className="font-mono">/scanner/enroll</span>. If you
              lose it, revoke the device and create a new one.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/device-create-form.test.tsx`
Expected: PASS (3 tests — the original error test plus the two new ones). The original test still passes because `Field` renders the error text in its `role="alert"` `<p>`.

- [ ] **Step 5: Commit**

```bash
git add components/events/device-create-form.tsx __tests__/components/events/device-create-form.test.tsx
git commit -m "feat(devices): migrate device-create form to Field/Input/Select kit + neutral code block"
```

---

## Task 3: Device table → `EmptyState` + palette status tones

**Files:**
- Modify: `components/events/device-table.tsx`
- Test: `__tests__/components/events/device-table.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/device-table.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/devices", () => ({
  useDevices: vi.fn(),
  useRevokeDevice: vi.fn(),
}));

import { DeviceTable } from "@/components/events/device-table";
import { useDevices, useRevokeDevice } from "@/lib/devices";

const mockUseDevices = vi.mocked(useDevices);
const mockUseRevoke = vi.mocked(useRevokeDevice);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRevoke.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRevokeDevice>);
});

function setDevices(data: unknown) {
  mockUseDevices.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useDevices>);
}

describe("DeviceTable", () => {
  it("shows the EmptyState when there are no devices", () => {
    setDevices([]);
    render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
  });

  it("uses palette tones for each device state", () => {
    setDevices([
      { id: "1", label: "Enrolled one", role: "scanner", gate: "", enrolled_at: "2026-01-01" },
      { id: "2", label: "Pending one", role: "scanner", gate: "" },
      { id: "3", label: "Revoked one", role: "scanner", gate: "", revoked_at: "2026-01-02" },
    ]);
    render(<DeviceTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("Enrolled").className).toContain("text-success");
    expect(screen.getByText("Pending enrollment").className).toContain("text-muted-foreground");
    expect(screen.getByText("Revoked").className).toContain("text-destructive");
  });
});
```

Add the missing `beforeEach` import: ensure the top line is `import { beforeEach, describe, expect, it, vi } from "vitest";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/device-table.test.tsx`
Expected: FAIL (empty branch renders a `<p>No devices yet.</p>` with a trailing period — `getByText("No devices yet")` without the period won't match the EmptyState that doesn't exist yet; and tones use `text-green-600`/`text-amber-600`).

- [ ] **Step 3: Edit `components/events/device-table.tsx`**

Add imports at the top (after the existing imports):

```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoDevices } from "@/lib/illustrations";
```

Replace the `deviceState` function body's tones:

```tsx
function deviceState(d: Device): { label: string; tone: string } {
  if (d.revoked_at) return { label: "Revoked", tone: "text-destructive" };
  if (d.enrolled_at) return { label: "Enrolled", tone: "text-success" };
  return { label: "Pending enrollment", tone: "text-muted-foreground" };
}
```

Replace the empty branch — change:

```tsx
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices yet.</p>
        ) : (
```

to:

```tsx
        ) : !data || data.length === 0 ? (
          <EmptyState
            illustration={NoDevices}
            title="No devices yet"
            message="Create a device above, then open the enrollment page on that device to start scanning guests in."
          />
        ) : (
```

Leave everything else (table markup, loading/error branches, revoke button + `confirm()`, hooks) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/device-table.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/events/device-table.tsx __tests__/components/events/device-table.test.tsx
git commit -m "feat(devices): EmptyState + palette status tones in device table"
```

---

## Task 4: Scanner enroll page → `InstallGuide` + de-amber + `Button`

**Files:**
- Modify: `app/scanner/enroll/page.tsx`
- Test: `__tests__/app/scanner-enroll-page.test.tsx`

The existing enroll-page tests use role/text/placeholder selectors (`/Reset & re-enroll/`, `/Confirm reset/`, `/Enroll device/`, `/Confirm & enroll/`, `/Open Walk-in display/`, placeholder `• • • •` and `Paste here`, error texts). All those strings are preserved by this task, so the existing tests stay green. We add one assertion for `InstallGuide`.

- [ ] **Step 1: Add a failing test** — append inside `__tests__/app/scanner-enroll-page.test.tsx` a new `describe` block (the file already mocks `next/navigation`, `@/lib/scanner/api`, `@/lib/scanner/session`):

```tsx
describe("ScannerEnrollPage install guide", () => {
  it("shows the add-to-home-screen guide", () => {
    mockUseDevice.mockReturnValue(null);
    render(<ScannerEnrollPage />);
    expect(screen.getByText("Add this page to your home screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/app/scanner-enroll-page.test.tsx`
Expected: FAIL on the new test (`InstallGuide` not present); existing tests still pass.

- [ ] **Step 3: Edit `app/scanner/enroll/page.tsx`** — apply these exact changes.

(3a) Add imports after the existing `useState`/api/session imports:

```tsx
import { Button } from "@/components/ui/button";
import { InstallGuide } from "@/components/common/install-guide";
```

(3b) Insert `<InstallGuide />` after the intro paragraph. Find:

```tsx
      <p className="mt-2 text-sm text-muted-foreground">
        Paste the one-time enrollment code your event organizer gave you. The device will bind to
        that event until revoked.
      </p>
```

and add immediately after it:

```tsx
      <InstallGuide className="mt-6" />
```

(3c) De-amber the "already enrolled" card. Change:

```tsx
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
```
to:
```tsx
        <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
```

Change the warning icon class `className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"` to `className="mt-0.5 h-5 w-5 shrink-0 text-foreground"`.

Change `<p className="font-medium text-amber-900">` to `<p className="font-medium text-foreground">`.

Change `<p className="mt-1 text-amber-800/80">` to `<p className="mt-1 text-muted-foreground">`.

(3d) Replace the "Reset & re-enroll" button. Change:

```tsx
              <button
                type="button"
                onClick={() => {
                  // Opening reset cancels any pending overwrite confirmation so
                  // the two PIN prompts can never appear at once.
                  setOverwriting(false);
                  setOverwritePin("");
                  setOverwriteError(null);
                  setResetting(true);
                }}
                className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Reset &amp; re-enroll
              </button>
```
to:
```tsx
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Opening reset cancels any pending overwrite confirmation so
                  // the two PIN prompts can never appear at once.
                  setOverwriting(false);
                  setOverwritePin("");
                  setOverwriteError(null);
                  setResetting(true);
                }}
              >
                Reset &amp; re-enroll
              </Button>
```

(3e) The "Open {ROLE_LABELS…}" resume link already uses `text-primary` — leave it unchanged.

(3f) Reset-form: change the label text `<span className="text-xs text-amber-800/80">Enter the event PIN to reset</span>` to `<span className="text-xs text-muted-foreground">Enter the event PIN to reset</span>`. Replace the two reset buttons. Change:

```tsx
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
```
to:
```tsx
                <Button type="submit" variant="destructive" size="sm" disabled={resetBusy || !resetPin}>
                  {resetBusy ? "Verifying…" : "Confirm reset"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResetting(false);
                    setResetPin("");
                    setResetError(null);
                  }}
                >
                  Cancel
                </Button>
```

Change the reset error `<p className="text-xs text-red-600">{resetError}</p>` to `<p className="text-xs text-destructive">{resetError}</p>`.

(3g) Overwrite card. Change:

```tsx
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
```
to:
```tsx
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
```

Change its label `<span className="text-xs text-amber-800/80">` to `<span className="text-xs text-muted-foreground">`.

Replace the two overwrite buttons. Change:

```tsx
              <button
                type="submit"
                disabled={overwriteBusy || !overwritePin}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {overwriteBusy ? "Verifying…" : "Confirm & enroll"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverwriting(false);
                  setOverwritePin("");
                  setOverwriteError(null);
                }}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                Cancel
              </button>
```
to:
```tsx
              <Button type="submit" disabled={overwriteBusy || !overwritePin}>
                {overwriteBusy ? "Verifying…" : "Confirm & enroll"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOverwriting(false);
                  setOverwritePin("");
                  setOverwriteError(null);
                }}
              >
                Cancel
              </Button>
```

Change the overwrite error `<p className="text-xs text-red-600">{overwriteError}</p>` to `<p className="text-xs text-destructive">{overwriteError}</p>`.

(3h) Leave the big full-width **"Enroll device"** submit `<button>` as-is (it already uses `bg-primary`/`text-primary-foreground` — the scanner big-bold exception). Change only its error sibling `<p className="text-sm text-red-600">{error}</p>` to `<p className="text-sm text-destructive">{error}</p>`.

(3i) Do NOT change any handler, state, the PIN `<input>` markup, or the code `<textarea>` markup.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run __tests__/app/scanner-enroll-page.test.tsx`
Expected: PASS (all existing tests + the new install-guide test). If any existing test now fails on a class-based query, re-check that the button/error *text* is unchanged (it should be) — do not weaken the test.

Also confirm no amber/red leakage:

Run: `grep -nE "amber|red-600|bg-white|border-neutral" "app/scanner/enroll/page.tsx"`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add app/scanner/enroll/page.tsx __tests__/app/scanner-enroll-page.test.tsx
git commit -m "feat(scanner/enroll): InstallGuide + de-amber callouts + Button primitives"
```

---

## Task 5: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green (the four touched test files plus the rest).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (the 3 pre-existing `<img>` warnings in `registration-form.tsx` / `info-form.tsx` / `event-presentation-editor.tsx` are unrelated and acceptable); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(devices): format Phase 2 adoption"
```

---

## Self-Review

- **Spec coverage:** §A admin page Guide → Task 1; §B form kit + neutral code block → Task 2; §C EmptyState + tones → Task 3; §D enroll InstallGuide + de-amber + Button (PIN flow untouched, big Enroll button left as-is) → Task 4; testing → per-task tests + Task 5. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code or an exact find/replace.
- **Type consistency:** `htmlFor`/`id` pairs match (`device-label`/`device-label-error`, `device-role`, `device-gate`); `GuideStep`/illustration names match the merged foundation exports (`DeviceCreate`, `CopyCode`, `OpenEnrollPage`, `EnterPin`, `NoDevices`); `Field`/`Input`/`Select`/`EmptyState`/`Button`/`InstallGuide`/`Guide` import paths match `@/components/ui/*` and `@/components/common/*`.
