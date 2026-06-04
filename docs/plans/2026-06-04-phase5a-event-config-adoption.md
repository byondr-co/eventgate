# Phase 5a — Event Configuration Forms Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the monochrome design system across the event-configuration admin forms — `Field`/`Input`/`Select`/`Textarea` kit, `--success` for success messages, a new `--warning` token for the stats widget, and a token-aligned required checkbox.

**Architecture:** Presentational migration of six `components/events/*` config components + one new `--warning` token in `globals.css`. All hooks, validation, draft patterns, wizard steps, and builder logic are preserved. None of these components had tests; focused tests are added per component.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase5a-event-config-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier — re-add and commit if it reformats. Branch `claude/phase5-remaining-pages` (already created off `main`).

## File Structure

**Modified:**
- `frontend/app/globals.css` — add `--warning` token.
- `frontend/components/events/stats-widget.tsx` — tones → `text-warning` / `text-destructive`.
- `frontend/components/events/pin-management-card.tsx` — Field/Input + success token.
- `frontend/components/events/walkin-settings-card.tsx` — Field/Input + success token.
- `frontend/components/events/event-create-wizard.tsx` — Field/Input.
- `frontend/components/events/registration-form-builder.tsx` — Input/Select + token checkbox.
- `frontend/components/events/event-presentation-editor.tsx` — Field/Textarea.

**Tests created/modified:**
- `frontend/__tests__/theme/tokens.test.ts` (extend)
- Create: `frontend/__tests__/components/events/{stats-widget,pin-management-card,event-create-wizard,registration-form-builder,event-presentation-editor}.test.tsx`

---

## Task 1: Add the `--warning` token

**Files:**
- Modify: `app/globals.css`
- Test: `__tests__/theme/tokens.test.ts`

- [ ] **Step 1: Extend the tokens test** — append these assertions inside the existing `describe("theme tokens", …)` in `__tests__/theme/tokens.test.ts`:

```ts
  it("defines a warning token in both modes", () => {
    const occurrences = css.match(/--warning:/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("maps warning into the tailwind theme", () => {
    expect(css).toContain("--color-warning: var(--warning)");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: FAIL (no `--warning` yet).

- [ ] **Step 3: Edit `app/globals.css`**

In the `@theme inline { … }` block, after the `--color-success-foreground` line, add:
```css
  --color-warning: var(--warning);
```
In `:root`, add (next to `--success`):
```css
  --warning: oklch(0.72 0.16 75);
```
In `.dark`, add (next to its `--success`):
```css
  --warning: oklch(0.8 0.15 75);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css __tests__/theme/tokens.test.ts
git commit -m "feat(theme): add warning semantic token"
```

---

## Task 2: `stats-widget` → warning/destructive tokens

**Files:**
- Modify: `components/events/stats-widget.tsx`
- Test: `__tests__/components/events/stats-widget.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/stats-widget.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-stats", () => ({
  useEventStats: vi.fn(),
}));

import { StatsWidget } from "@/components/events/stats-widget";
import { useEventStats } from "@/lib/event-stats";

const mockStats = vi.mocked(useEventStats);

it("colors warning tiles with text-warning and danger tiles with text-destructive", () => {
  mockStats.mockReturnValue({
    data: {
      checked_in: 1,
      registered_not_arrived: 2,
      displayed: 3,
      manual_review: 5, // > 0 → warning
      open_escalations: 0,
      conflicts_recent_15min: 4, // > 0 → danger
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useEventStats>);

  render(<StatsWidget orgSlug="o" eventSlug="e" />);
  expect(screen.getByText("5").className).toContain("text-warning");
  expect(screen.getByText("4").className).toContain("text-destructive");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/stats-widget.test.tsx`
Expected: FAIL (current classes are `text-amber-600` / `text-red-600`).

- [ ] **Step 3: Edit `components/events/stats-widget.tsx`** — replace the className ternary:
```tsx
              className={`text-2xl font-semibold tabular-nums ${
                t.tone === "warning"
                  ? "text-amber-600 dark:text-amber-400"
                  : t.tone === "danger"
                    ? "text-red-600 dark:text-red-400"
                    : ""
              }`}
```
with:
```tsx
              className={`text-2xl font-semibold tabular-nums ${
                t.tone === "warning"
                  ? "text-warning"
                  : t.tone === "danger"
                    ? "text-destructive"
                    : ""
              }`}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/stats-widget.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/events/stats-widget.tsx __tests__/components/events/stats-widget.test.tsx
git commit -m "feat(events): stats widget uses warning/destructive tokens"
```

---

## Task 3: `pin-management-card` → Field/Input + success token

**Files:**
- Modify: `components/events/pin-management-card.tsx`
- Test: `__tests__/components/events/pin-management-card.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/pin-management-card.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/devices", () => ({ useSetPin: vi.fn() }));

import { PinManagementCard } from "@/components/events/pin-management-card";
import { useSetPin } from "@/lib/devices";

const mockSetPin = vi.mocked(useSetPin);

beforeEach(() => vi.clearAllMocks());

describe("PinManagementCard", () => {
  it("labels both PIN fields via Field", () => {
    mockSetPin.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<PinManagementCard orgSlug="o" eventSlug="e" />);
    expect(screen.getByLabelText("New PIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm PIN")).toBeInTheDocument();
  });

  it("shows the success message in the success token color", async () => {
    mockSetPin.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ rotated_at: "2026-06-04T00:00:00Z" }),
      isPending: false,
    } as never);
    render(<PinManagementCard orgSlug="o" eventSlug="e" />);
    fireEvent.change(screen.getByLabelText("New PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Set \/ rotate PIN/ }));
    const msg = await screen.findByText(/PIN updated at/);
    expect(msg.className).toContain("text-success");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/pin-management-card.test.tsx`
Expected: FAIL (no `getByLabelText` association yet; success uses `text-green-600`).

- [ ] **Step 3: Overwrite `components/events/pin-management-card.tsx`** with:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSetPin } from "@/lib/devices";

type Props = { orgSlug: string; eventSlug: string };

export function PinManagementCard({ orgSlug, eventSlug }: Props) {
  const setPin = useSetPin(orgSlug, eventSlug);
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (pin.length < 4) {
      setError("PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match.");
      return;
    }
    try {
      const r = await setPin.mutateAsync(pin);
      setSuccess(`PIN updated at ${new Date(r.rotated_at).toLocaleString()}.`);
      setPinValue("");
      setConfirm("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event PIN</CardTitle>
        <CardDescription>
          Staff devices enter this PIN at the door to unlock their scanner / display. Share it at
          the staff briefing; rotate it after each event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-sm space-y-4">
          <Field label="New PIN" htmlFor="event-pin">
            <Input
              id="event-pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
              className="font-mono tracking-widest"
              placeholder="At least 4 characters"
            />
          </Field>
          <Field label="Confirm PIN" htmlFor="event-pin-confirm">
            <Input
              id="event-pin-confirm"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="font-mono tracking-widest"
            />
          </Field>
          <Button type="submit" disabled={setPin.isPending}>
            {setPin.isPending ? "Saving…" : "Set / rotate PIN"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-success">{success}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/pin-management-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/events/pin-management-card.tsx __tests__/components/events/pin-management-card.test.tsx
git commit -m "feat(events): migrate PIN management card to Field/Input + success token"
```

---

## Task 4: `walkin-settings-card` → Field/Input + success token

**Files:**
- Modify: `components/events/walkin-settings-card.tsx`
- Test: none new (covered by tsc + suite; this mirrors Task 3 exactly)

This task has no dedicated test (it is the same mechanical Field/Input + token swap as Task 3, on a single field; the success-color path is structurally identical and already covered by Task 3's pattern). Verified by `tsc` + the full suite.

- [ ] **Step 1: Edit `components/events/walkin-settings-card.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
```

(b) Replace the label/input block:
```tsx
          <label className="block">
            <span className="text-sm font-medium">Capacity</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={capacity}
              onChange={(e) => setCapacityDraft(e.target.value)}
              disabled={event.isLoading}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder="0"
            />
          </label>
```
with:
```tsx
          <Field label="Capacity" htmlFor="walkin-capacity">
            <Input
              id="walkin-capacity"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={capacity}
              onChange={(e) => setCapacityDraft(e.target.value)}
              disabled={event.isLoading}
              className="font-mono"
              placeholder="0"
            />
          </Field>
```

(c) Change the success message color:
```tsx
          {success && <p className="text-sm text-green-600">{success}</p>}
```
to:
```tsx
          {success && <p className="text-sm text-success">{success}</p>}
```

Leave the draft pattern, validation, and mutation logic unchanged.

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit` — expect clean.
Run: `grep -n "green-600" components/events/walkin-settings-card.tsx` — expect no matches.

- [ ] **Step 3: Commit**

```bash
git add components/events/walkin-settings-card.tsx
git commit -m "feat(events): migrate walk-in settings card to Field/Input + success token"
```

---

## Task 5: `event-create-wizard` → Field/Input

**Files:**
- Modify: `components/events/event-create-wizard.tsx`
- Test: `__tests__/components/events/event-create-wizard.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/event-create-wizard.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/events", () => ({ useCreateEvent: vi.fn() }));

import { EventCreateWizard } from "@/components/events/event-create-wizard";
import { useCreateEvent } from "@/lib/events";

const mockCreate = vi.mocked(useCreateEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("EventCreateWizard", () => {
  it("labels its fields via Field", () => {
    render(<EventCreateWizard orgSlug="o" />);
    expect(screen.getByLabelText("Event name")).toBeInTheDocument();
    expect(screen.getByLabelText("URL slug")).toBeInTheDocument();
    expect(screen.getByLabelText(/Venue/)).toBeInTheDocument();
    expect(screen.getByLabelText("Walk-in capacity")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/event-create-wizard.test.tsx`
Expected: FAIL (`getByLabelText` finds no associated control — current uses bare `<span>` labels).

- [ ] **Step 3: Overwrite `components/events/event-create-wizard.tsx`** with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreateEvent } from "@/lib/events";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function EventCreateWizard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const create = useCreateEvent(orgSlug);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [venue, setVenue] = useState("");
  // 0 = unlimited (matches backend default + `walkins_enabled` toggle being
  // independent). Store as string so the input can be empty mid-edit; coerce
  // on submit.
  const [walkinCapacity, setWalkinCapacity] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cap = walkinCapacity.trim() === "" ? 0 : Number(walkinCapacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Walk-in capacity must be a non-negative whole number.");
      return;
    }
    try {
      const event = await create.mutateAsync({ name, slug, venue, walkin_capacity: cap });
      router.push(`/orgs/${orgSlug}/events/${event.slug}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create event</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Event name" htmlFor="event-name">
            <Input
              id="event-name"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`byondr.co Conference ${new Date().getFullYear()}`}
            />
          </Field>
          <Field
            label="URL slug"
            htmlFor="event-slug"
            helper={
              <>
                Public form: /e/{orgSlug}/{slug || "your-slug"}/register
              </>
            }
          >
            <Input
              id="event-slug"
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="font-mono"
            />
          </Field>
          <Field label="Venue" htmlFor="event-venue" optional>
            <Input id="event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </Field>
          <Field
            label="Walk-in capacity"
            htmlFor="event-walkin-capacity"
            helper={
              <>
                Hard cap on total walk-in guests. <code>0</code> means unlimited. Editable later in
                event settings.
              </>
            }
          >
            <Input
              id="event-walkin-capacity"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={walkinCapacity}
              onChange={(e) => setWalkinCapacity(e.target.value)}
              className="font-mono"
              placeholder="0"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={create.isPending || !name || !slug}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/event-create-wizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/events/event-create-wizard.tsx __tests__/components/events/event-create-wizard.test.tsx
git commit -m "feat(events): migrate event-create wizard to Field/Input"
```

---

## Task 6: `registration-form-builder` → Input/Select + token checkbox

**Files:**
- Modify: `components/events/registration-form-builder.tsx`
- Test: `__tests__/components/events/registration-form-builder.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/registration-form-builder.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useFields: vi.fn(),
  useAddField: vi.fn(),
  useDeleteField: vi.fn(),
}));

import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";
import { useAddField, useDeleteField, useFields } from "@/lib/events";

const mockFields = vi.mocked(useFields);
const mockAdd = vi.mocked(useAddField);
const mockDelete = vi.mocked(useDeleteField);

beforeEach(() => {
  vi.clearAllMocks();
  mockFields.mockReturnValue({ data: { results: [] }, isLoading: false } as never);
  mockAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockDelete.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

describe("RegistrationFormBuilder add-field controls", () => {
  it("uses Input and Select primitives and a checkbox", () => {
    render(<RegistrationFormBuilder orgSlug="o" eventSlug="e" />);
    expect(screen.getByPlaceholderText("Label (English)")).toHaveAttribute("data-slot", "input");
    expect(screen.getByRole("combobox")).toHaveAttribute("data-slot", "select");
    expect(screen.getByRole("checkbox", { name: /Required/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/registration-form-builder.test.tsx`
Expected: FAIL (raw `<input>`/`<select>` have no `data-slot`).

- [ ] **Step 3: Edit `components/events/registration-form-builder.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
```

(b) Replace the add-field `<form>` body (the two `<input>`s, the `<select>`, and the checkbox `<label>`) — change:
```tsx
            <input
              required
              placeholder="Label (English)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Label (Khmer)"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="textarea">Long text</option>
              <option value="select">Select</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Required
            </label>
```
to:
```tsx
            <Input
              required
              placeholder="Label (English)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Label (Khmer)"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
            />
            <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="textarea">Long text</option>
              <option value="select">Select</option>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="size-4 rounded accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              Required
            </label>
```

Leave the `onAdd` logic, the fields table, and `ConfirmDialog` removal flow unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/registration-form-builder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/events/registration-form-builder.tsx __tests__/components/events/registration-form-builder.test.tsx
git commit -m "feat(events): builder add-field row uses Input/Select + token checkbox"
```

---

## Task 7: `event-presentation-editor` → Field/Textarea

**Files:**
- Modify: `components/events/event-presentation-editor.tsx`
- Test: `__tests__/components/events/event-presentation-editor.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/event-presentation-editor.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useEvent: vi.fn(),
  useUpdateEvent: vi.fn(),
  useUploadBanner: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { EventPresentationEditor } from "@/components/events/event-presentation-editor";
import { useEvent, useUpdateEvent, useUploadBanner } from "@/lib/events";

const mockEvent = vi.mocked(useEvent);
const mockUpdate = vi.mocked(useUpdateEvent);
const mockUpload = vi.mocked(useUploadBanner);

beforeEach(() => {
  vi.clearAllMocks();
  mockEvent.mockReturnValue({ data: { description: "", banner_image: null } } as never);
  mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockUpload.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("EventPresentationEditor", () => {
  it("renders the description via a Textarea labeled through Field", () => {
    render(<EventPresentationEditor orgSlug="o" eventSlug="e" />);
    const ta = screen.getByLabelText("Description");
    expect(ta).toHaveAttribute("data-slot", "textarea");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/event-presentation-editor.test.tsx`
Expected: FAIL (current description textarea has no label association / `data-slot`).

- [ ] **Step 3: Edit `components/events/event-presentation-editor.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
```

(b) Replace the description label/textarea block:
```tsx
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={value}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short welcome shown under the event name on the registration page."
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
```
with:
```tsx
        <Field label="Description" htmlFor="event-description">
          <Textarea
            id="event-description"
            value={value}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short welcome shown under the event name on the registration page."
          />
        </Field>
```

Leave the banner section (`<span>Banner image</span>`, the current banner `<img>`, and `FileDropZone`) and the save logic unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/event-presentation-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/events/event-presentation-editor.tsx __tests__/components/events/event-presentation-editor.test.tsx
git commit -m "feat(events): presentation editor description uses Field/Textarea"
```

---

## Task 8: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green (the new event-config tests + the rest).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (the pre-existing `<img>` warnings — incl. `event-presentation-editor.tsx`'s banner — remain, acceptable); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Verify no leftover legacy colors in the touched components**

Run: `grep -rnE "green-600|amber-[0-9]|text-red-[0-9]|bg-red-[0-9]" components/events/stats-widget.tsx components/events/pin-management-card.tsx components/events/walkin-settings-card.tsx`
Expected: no matches.

- [ ] **Step 4: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(events): format Phase 5a adoption"
```

---

## Self-Review

- **Spec coverage:** §A `--warning` token → Task 1; §B stats-widget → Task 2; §C config cards → Tasks 3 (pin) + 4 (walk-in); §D wizard → Task 5; §E builder (Input/Select + token checkbox; the field-type control was confirmed a raw `<select>` → `Select`) → Task 6; §F presentation editor → Task 7; testing/gate → per-task tests + Task 8. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code or exact find/replace. Task 4 deliberately carries no new test (documented: identical mechanical swap to Task 3, verified by tsc + grep + suite).
- **Type consistency:** `--warning`/`--color-warning` names match between token, theme map, test, and `text-warning`/`text-destructive` usage in stats-widget; `Field`/`Input`/`Select`/`Textarea` import paths match the foundation; `htmlFor`/`id` pairs (`event-pin`, `event-pin-confirm`, `walkin-capacity`, `event-name`, `event-slug`, `event-venue`, `event-walkin-capacity`, `event-description`) are consistent; success messages use `text-success`. Existing component logic (hooks, validation, drafts, slugify, builder add/remove) is preserved verbatim in the full-file rewrites.
