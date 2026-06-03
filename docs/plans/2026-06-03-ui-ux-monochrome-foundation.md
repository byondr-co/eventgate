# UI/UX Monochrome Overhaul — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monochrome design-system foundation — retuned tokens (light + dark), a shared OpenAI-console-matched form primitive kit, an empty-state primitive, and a thin-line SVG illustration + guide system — so every page can adopt it in later phases.

**Architecture:** Tailwind-v4 token retune in `globals.css` (kill the blue-violet `--primary`, add a `--success` semantic token), then shared primitives in `frontend/components/ui/` and `frontend/components/common/`, then an inline-SVG illustration library in `frontend/lib/illustrations/`. Interactive primitives use **native styled elements** (`<select>`, `<button role="switch">`, `<input type="range">`) for full accessibility with zero Base-UI-version API risk; `Button`/`Dialog` keep their existing Base UI (`@base-ui/react`) implementation. Illustrations use `stroke="currentColor"` so they adapt to light/dark automatically.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, `class-variance-authority`, `lucide-react`, Vitest + `@testing-library/react`. Tests run with `pnpm test` (alias for `vitest run`); single file via `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-03-ui-ux-monochrome-overhaul-design.md`

---

## Pre-flight (run once before any task)

Frontend tooling needs Node ≥ 18 (use 20). From the repo root:

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm` commands below run from `frontend/`. Commits are single-line conventional, **no `Co-Authored-By` trailer** (project convention). Work happens on the current worktree branch.

---

## File Structure

**Modified:**
- `frontend/app/globals.css` — retune `:root` + `.dark` tokens; add `--success` / `--color-success`.
- `frontend/components/ui/textarea.tsx` — add resize affordance + align focus ring.
- `frontend/components/ui/button.tsx` — add `pill` size (hierarchy otherwise already present; recolor comes free from tokens).

**Created (primitives):**
- `frontend/components/ui/field.tsx` — `Field` (label + control slot + helper + inline error, a11y wiring).
- `frontend/components/ui/input.tsx` — `Input`.
- `frontend/components/ui/select.tsx` — `Select` (native, chevron).
- `frontend/components/ui/toggle.tsx` — `Toggle` (switch).
- `frontend/components/ui/slider.tsx` — `Slider`.
- `frontend/components/ui/segmented-control.tsx` — `SegmentedControl`.
- `frontend/components/ui/empty-state.tsx` — `EmptyState`.

**Created (illustrations + guides):**
- `frontend/lib/illustrations/index.tsx` — barrel export.
- `frontend/lib/illustrations/flow.tsx` — flow art (`DeviceCreate`, `CopyCode`, `OpenEnrollPage`, `EnterPin`, `InstallPWA`, `ScanGuest`, `WalkinInfo`).
- `frontend/lib/illustrations/empty.tsx` — empty-state spots (`NoDevices`, `NoGuests`, `NoEvents`, `NoLinks`).
- `frontend/components/common/guide.tsx` — `Guide` / `Steps`.
- `frontend/components/common/install-guide.tsx` — `InstallGuide`.

**Created (docs):**
- `frontend/docs/ui-style-note.md` — the type scale + token + primitive usage note.

**Tests created:**
- `frontend/__tests__/theme/tokens.test.ts`
- `frontend/__tests__/components/ui/{field,input,select,toggle,slider,segmented-control,empty-state}.test.tsx`
- `frontend/__tests__/lib/illustrations.test.tsx`
- `frontend/__tests__/components/common/guide.test.tsx`

---

## Task 1: Retune theme tokens (mono + semantic, both modes)

**Files:**
- Modify: `frontend/app/globals.css`
- Test: `frontend/__tests__/theme/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/theme/tokens.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

describe("theme tokens", () => {
  it("no longer uses the blue-violet primary hue", () => {
    expect(css).not.toContain("264.376");
  });

  it("defines a near-black primary in :root", () => {
    expect(css).toMatch(/--primary:\s*oklch\(0\.205 0 0\)/);
  });

  it("defines a success token in both modes", () => {
    const occurrences = css.match(/--success:/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("maps success into the tailwind theme", () => {
    expect(css).toContain("--color-success: var(--success)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: FAIL (`264.376` still present; `--primary` is the violet; no `--success`).

- [ ] **Step 3: Edit `globals.css`**

In the `@theme inline { … }` block, add after the `--color-primary` line:

```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
```

In `:root`, change `--primary` and `--primary-foreground`, and add success + align sidebar-primary:

```css
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --success: oklch(0.55 0.13 150);
  --success-foreground: oklch(0.985 0 0);
```

Also in `:root` change the sidebar active color away from violet:

```css
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
```

In `.dark`, invert primary (near-white button, dark text) and add success:

```css
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --success: oklch(0.7 0.13 150);
  --success-foreground: oklch(0.205 0 0);
```

And in `.dark` align the sidebar primary:

```css
  --sidebar-primary: oklch(0.985 0 0);
  --sidebar-primary-foreground: oklch(0.205 0 0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css __tests__/theme/tokens.test.ts
git commit -m "feat(theme): retune tokens to mono + semantic (near-black primary, success token)"
```

---

## Task 2: `Field` primitive

**Files:**
- Create: `frontend/components/ui/field.tsx`
- Test: `frontend/__tests__/components/ui/field.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/field.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/ui/field";

describe("Field", () => {
  it("renders label and helper text", () => {
    render(
      <Field label="Label" helper="Helper text" htmlFor="x">
        <input id="x" />
      </Field>,
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Helper text")).toBeInTheDocument();
  });

  it("shows an inline error with role=alert and hides helper when errored", () => {
    render(
      <Field label="Label" helper="Helper text" error="Required" htmlFor="x">
        <input id="x" />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Required");
    expect(screen.queryByText("Helper text")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/field.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/field'").

- [ ] **Step 3: Create `field.tsx`**

```tsx
// frontend/components/ui/field.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

function Field({ label, htmlFor, helper, error, optional, className, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)} data-slot="field">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export { Field };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/field.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/field.tsx __tests__/components/ui/field.test.tsx
git commit -m "feat(ui): add Field primitive (label + helper + inline error)"
```

---

## Task 3: `Input` primitive

**Files:**
- Create: `frontend/components/ui/input.tsx`
- Test: `frontend/__tests__/components/ui/input.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/input.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("renders with data-slot and forwards props", () => {
    render(<Input placeholder="Event name" aria-invalid />);
    const el = screen.getByPlaceholderText("Event name");
    expect(el).toHaveAttribute("data-slot", "input");
    expect(el).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/input.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/input'").

- [ ] **Step 3: Create `input.tsx`** (mirror the existing `textarea.tsx` class treatment for consistency)

```tsx
// frontend/components/ui/input.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/input.tsx __tests__/components/ui/input.test.tsx
git commit -m "feat(ui): add Input primitive"
```

---

## Task 4: Upgrade `Textarea` (resize affordance)

**Files:**
- Modify: `frontend/components/ui/textarea.tsx`
- Test: `frontend/__tests__/components/ui/textarea.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/textarea.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("allows vertical resize", () => {
    render(<Textarea placeholder="Notes" />);
    expect(screen.getByPlaceholderText("Notes").className).toContain("resize-y");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/textarea.test.tsx`
Expected: FAIL (current classes include no `resize-y`).

- [ ] **Step 3: Edit `textarea.tsx`** — add `resize-y` to the class string (insert right after `min-h-16`):

```tsx
        "flex field-sizing-content min-h-16 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/textarea.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/textarea.tsx __tests__/components/ui/textarea.test.tsx
git commit -m "feat(ui): textarea vertical resize affordance"
```

---

## Task 5: `Select` primitive (native, chevron)

**Files:**
- Create: `frontend/components/ui/select.tsx`
- Test: `frontend/__tests__/components/ui/select.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/select.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Select } from "@/components/ui/select";

describe("Select", () => {
  it("renders options and forwards value", () => {
    render(
      <Select aria-label="Role" defaultValue="b">
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </Select>,
    );
    const el = screen.getByLabelText("Role") as HTMLSelectElement;
    expect(el).toHaveAttribute("data-slot", "select");
    expect(el.value).toBe("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/select.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/select'").

- [ ] **Step 3: Create `select.tsx`** — native `<select>` with `appearance-none` + inline chevron background (mono, robust, accessible):

```tsx
// frontend/components/ui/select.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

const chevron =
  "bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat bg-[url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23737373'%20stroke-width='1.6'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m7%209%205-5%205%205M7%2015l5%205%205-5'/%3E%3C/svg%3E\")]";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-9 pl-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        chevron,
        className,
      )}
      {...props}
    />
  );
}

export { Select };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/select.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/select.tsx __tests__/components/ui/select.test.tsx
git commit -m "feat(ui): add Select primitive (native, chevron)"
```

---

## Task 6: `Toggle` primitive (switch)

**Files:**
- Create: `frontend/components/ui/toggle.tsx`
- Test: `frontend/__tests__/components/ui/toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/toggle.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Toggle } from "@/components/ui/toggle";

describe("Toggle", () => {
  it("exposes switch role and reflects checked state", () => {
    render(<Toggle checked aria-label="File search" onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "File search" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange with the toggled value", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} aria-label="PIN" onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "PIN" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/toggle.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/toggle'").

- [ ] **Step 3: Create `toggle.tsx`** — controlled `<button role="switch">`:

```tsx
// frontend/components/ui/toggle.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

type ToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"button">, "onClick" | "className">;

function Toggle({ checked, onCheckedChange, disabled, className, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="toggle"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block size-[18px] rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export { Toggle };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/toggle.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/toggle.tsx __tests__/components/ui/toggle.test.tsx
git commit -m "feat(ui): add Toggle (switch) primitive"
```

---

## Task 7: `Slider` primitive

**Files:**
- Create: `frontend/components/ui/slider.tsx`
- Test: `frontend/__tests__/components/ui/slider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/slider.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Slider } from "@/components/ui/slider";

describe("Slider", () => {
  it("renders a range input with the given value and bounds", () => {
    render(<Slider aria-label="Temperature" min={0} max={2} step={0.01} value={1} onValueChange={() => {}} />);
    const el = screen.getByLabelText("Temperature") as HTMLInputElement;
    expect(el).toHaveAttribute("type", "range");
    expect(el.value).toBe("1");
    expect(el).toHaveAttribute("max", "2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/slider.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/slider'").

- [ ] **Step 3: Create `slider.tsx`** — native range with `accent-color` from the primary token (auto-mono in both themes):

```tsx
// frontend/components/ui/slider.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "className">;

function Slider({ value, onValueChange, min = 0, max = 100, step = 1, disabled, className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      data-slot="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn(
        "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-input accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Slider };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/slider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/slider.tsx __tests__/components/ui/slider.test.tsx
git commit -m "feat(ui): add Slider primitive"
```

---

## Task 8: `SegmentedControl` primitive

**Files:**
- Create: `frontend/components/ui/segmented-control.tsx`
- Test: `frontend/__tests__/components/ui/segmented-control.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/segmented-control.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "@/components/ui/segmented-control";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "walkin", label: "Walk-in" },
];

describe("SegmentedControl", () => {
  it("marks the active option as pressed", () => {
    render(<SegmentedControl options={OPTIONS} value="all" onValueChange={() => {}} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Walk-in" })).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onValueChange when another option is clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="all" onValueChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(onChange).toHaveBeenCalledWith("walkin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/segmented-control.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/segmented-control'").

- [ ] **Step 3: Create `segmented-control.tsx`**

```tsx
// frontend/components/ui/segmented-control.tsx
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onValueChange: (next: T) => void;
  className?: string;
};

function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      data-slot="segmented-control"
      className={cn("inline-flex rounded-lg border border-border p-0.5", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/segmented-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/segmented-control.tsx __tests__/components/ui/segmented-control.test.tsx
git commit -m "feat(ui): add SegmentedControl primitive"
```

---

## Task 9: Add `pill` size to `Button`

**Files:**
- Modify: `frontend/components/ui/button.tsx`
- Test: `frontend/__tests__/components/ui/button-pill.test.tsx`

The variant hierarchy (default/outline/secondary/ghost/destructive/link) already exists and recolors to near-black automatically from Task 1. This task only adds the small rounded `pill` size used for `+ Files` / `⚙` chips.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/button-pill.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button pill size", () => {
  it("applies the pill size classes", () => {
    render(<Button size="pill">Files</Button>);
    expect(screen.getByRole("button", { name: "Files" }).className).toContain("rounded-full");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/button-pill.test.tsx`
Expected: FAIL (TypeScript rejects `size="pill"` / no `rounded-full`).

- [ ] **Step 3: Edit `button.tsx`** — add a `pill` entry to the `size` variants map (alongside `xs`):

```tsx
        pill: "h-7 gap-1 rounded-full px-3 text-xs has-data-[icon=inline-start]:pl-2",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/button-pill.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx __tests__/components/ui/button-pill.test.tsx
git commit -m "feat(ui): add pill button size"
```

---

## Task 10: Illustration library (flow + empty art)

**Files:**
- Create: `frontend/lib/illustrations/flow.tsx`
- Create: `frontend/lib/illustrations/empty.tsx`
- Create: `frontend/lib/illustrations/index.tsx`
- Test: `frontend/__tests__/lib/illustrations.test.tsx`

All illustrations share one signature: `(props: { className?: string }) => JSX`, render an `<svg>` with `stroke="currentColor"` and no hardcoded `fill` colors (so they adapt to light/dark). The viewBox base is `0 0 24 24`, `stroke-width={1.4}`, rounded caps — matching lucide.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/lib/illustrations.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as illustrations from "@/lib/illustrations";

const NAMES = [
  "DeviceCreate",
  "CopyCode",
  "OpenEnrollPage",
  "EnterPin",
  "InstallPWA",
  "ScanGuest",
  "WalkinInfo",
  "NoDevices",
  "NoGuests",
  "NoEvents",
  "NoLinks",
] as const;

describe("illustrations", () => {
  it.each(NAMES)("%s renders an svg using currentColor and no hardcoded fill", (name) => {
    const Comp = (illustrations as Record<string, React.FC<{ className?: string }>>)[name];
    expect(Comp).toBeTypeOf("function");
    const { container } = render(<Comp className="size-10" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.className.baseVal).toContain("size-10");
    expect(container.innerHTML).not.toMatch(/fill="#/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/lib/illustrations.test.tsx`
Expected: FAIL ("Cannot find module '@/lib/illustrations'").

- [ ] **Step 3: Create the three files**

```tsx
// frontend/lib/illustrations/flow.tsx
type IllustrationProps = { className?: string };

function base(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function DeviceCreate({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" />
      <circle cx="17.5" cy="6.5" r="4" />
      <line x1="17.5" y1="4.7" x2="17.5" y2="8.3" />
      <line x1="15.7" y1="6.5" x2="19.3" y2="6.5" />
    </>,
    className,
  );
}

export function CopyCode({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>,
    className,
  );
}

export function OpenEnrollPage({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18" />
      <path d="M9 21h6" />
      <path d="M12 18v3" />
    </>,
    className,
  );
}

export function EnterPin({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="8" cy="8" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16" cy="8" r="1" />
      <circle cx="8" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="16" cy="12" r="1" />
      <circle cx="8" cy="16" r="1" />
      <circle cx="12" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
    </>,
    className,
  );
}

export function InstallPWA({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 7v7" />
      <path d="m9 11 3 3 3-3" />
    </>,
    className,
  );
}

export function ScanGuest({ className }: IllustrationProps) {
  return base(
    <>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M4 12h16" />
    </>,
    className,
  );
}

export function WalkinInfo({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>,
    className,
  );
}
```

```tsx
// frontend/lib/illustrations/empty.tsx
type IllustrationProps = { className?: string };

function base(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function NoDevices({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" />
    </>,
    className,
  );
}

export function NoGuests({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14.5a6 6 0 0 1 4 5.5" />
    </>,
    className,
  );
}

export function NoEvents({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </>,
    className,
  );
}

export function NoLinks({ className }: IllustrationProps) {
  return base(
    <>
      <path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1" />
      <path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1" />
    </>,
    className,
  );
}
```

```tsx
// frontend/lib/illustrations/index.tsx
export * from "./flow";
export * from "./empty";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/lib/illustrations.test.tsx`
Expected: PASS (11 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/illustrations __tests__/lib/illustrations.test.tsx
git commit -m "feat(ui): add thin-line illustration library"
```

---

## Task 11: `EmptyState` primitive

**Files:**
- Create: `frontend/components/ui/empty-state.tsx`
- Test: `frontend/__tests__/components/ui/empty-state.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/ui/empty-state.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";
import { NoDevices } from "@/lib/illustrations";

describe("EmptyState", () => {
  it("renders illustration, title, message and action", () => {
    render(
      <EmptyState
        illustration={NoDevices}
        title="No devices yet"
        message="Enroll the first phone at your door."
        action={<button>Enroll a device</button>}
      />,
    );
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
    expect(screen.getByText("Enroll the first phone at your door.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enroll a device" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/ui/empty-state.test.tsx`
Expected: FAIL ("Cannot find module '@/components/ui/empty-state'").

- [ ] **Step 3: Create `empty-state.tsx`**

```tsx
// frontend/components/ui/empty-state.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  illustration?: React.FC<{ className?: string }>;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

function EmptyState({ illustration: Illustration, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-border bg-card px-5 py-12 text-center",
        className,
      )}
    >
      {Illustration && <Illustration className="mb-3.5 size-10 text-foreground" />}
      <h3 className="text-base font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/ui/empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/empty-state.tsx __tests__/components/ui/empty-state.test.tsx
git commit -m "feat(ui): add EmptyState primitive"
```

---

## Task 12: `Guide` / `Steps` + `InstallGuide`

**Files:**
- Create: `frontend/components/common/guide.tsx`
- Create: `frontend/components/common/install-guide.tsx`
- Test: `frontend/__tests__/components/common/guide.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/common/guide.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Guide } from "@/components/common/guide";
import { InstallGuide } from "@/components/common/install-guide";
import { CopyCode, DeviceCreate } from "@/lib/illustrations";

describe("Guide", () => {
  it("renders an ordered list with one numbered step per item", () => {
    render(
      <Guide
        steps={[
          { illustration: DeviceCreate, title: "Create a device", body: "Choose role and label." },
          { illustration: CopyCode, title: "Copy the code", body: "One-time enrollment code." },
        ]}
      />,
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Create a device")).toBeInTheDocument();
    expect(screen.getByText("Copy the code")).toBeInTheDocument();
  });

  it("InstallGuide shows iOS and Android instructions", () => {
    render(<InstallGuide />);
    expect(screen.getByText(/iOS/i)).toBeInTheDocument();
    expect(screen.getByText(/Android/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/common/guide.test.tsx`
Expected: FAIL ("Cannot find module '@/components/common/guide'").

- [ ] **Step 3: Create `guide.tsx`**

```tsx
// frontend/components/common/guide.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

export type GuideStep = {
  illustration: React.FC<{ className?: string }>;
  title: React.ReactNode;
  body?: React.ReactNode;
};

type GuideProps = {
  steps: GuideStep[];
  className?: string;
};

function Guide({ steps, className }: GuideProps) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {steps.map((step, i) => {
        const Illustration = step.illustration;
        return (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Illustration className="size-8 text-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
            </div>
            <p className="text-sm font-semibold">{step.title}</p>
            {step.body && <p className="text-xs text-muted-foreground">{step.body}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export { Guide };
```

- [ ] **Step 4: Create `install-guide.tsx`**

```tsx
// frontend/components/common/install-guide.tsx
import { InstallPWA } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

type InstallGuideProps = { className?: string };

function InstallGuide({ className }: InstallGuideProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-3">
        <InstallPWA className="size-8 text-foreground" />
        <p className="text-sm font-semibold">Add this page to your home screen</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">iOS · Safari</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap Share, then “Add to Home Screen”.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Android · Chrome</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the ⋮ menu, then “Add to Home screen”.
          </p>
        </div>
      </div>
    </div>
  );
}

export { InstallGuide };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/common/guide.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add components/common/guide.tsx components/common/install-guide.tsx __tests__/components/common/guide.test.tsx
git commit -m "feat(ui): add Guide/Steps and InstallGuide components"
```

---

## Task 13: Style note doc

**Files:**
- Create: `frontend/docs/ui-style-note.md`

- [ ] **Step 1: Write the doc**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/ui-style-note.md
git commit -m "docs(ui): add monochrome design-system style note"
```

---

## Task 14: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS — all new primitive/illustration/guide tests plus the existing suite. (CI clean-install is the authoritative gate; local fresh checkouts can spuriously fail to resolve `sonner`/`next-themes` — if a *pre-existing* unrelated test errors on module resolution, note it but do not block on it.)

- [ ] **Step 2: Lint + format check**

Run: `pnpm lint && pnpm format:check`
Expected: PASS (run `pnpm format` to fix formatting if needed, then re-commit).

- [ ] **Step 3: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(ui): format foundation primitives"
```

---

## Subsequent phases (separate plans — written after this foundation merges)

These are intentionally **not** detailed here: their task code depends on the exact primitive APIs established above, so they will be planned once the foundation is in `main`. Each is its own working, testable PR and gets its own plan via the writing-plans skill.

- **Phase 2 — Devices adoption:** replace the `<ol>` instruction list on `app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx` with `Guide` (flow illustrations); migrate `components/events/device-create-form.tsx` to `Field`/`Input`/`Select` and the neutral grey code block; add `EmptyState` to `device-table.tsx`. Add `InstallGuide` to the scanner enroll instruction block (`app/scanner/enroll`).
- **Phase 3 — Guests adoption:** swap the filter chips for `SegmentedControl`; add `EmptyState`; apply success/neutral status chips.
- **Phase 4 — Public register adoption:** migrate the data-driven registration form + confirmation/empty states to the kit.
- **Phase 5 — Remaining console + public + auth pages:** orgs, events (settings/form/imports/audit/links/helpdesk), members, info/registered/claim, login/invites.

Per spec risk note: if the ~16-day pilot window compresses, the safe deferral is later page-adoption phases — the foundation (Phase 1) still ships and delivers the global token win.

---

## Self-Review

- **Spec coverage:** §1 tokens → Task 1; §2 primitives → Tasks 2–9, 11; §3 illustrations/guides → Tasks 10, 12; §4 surface application → Phases 2–5 (scoped as follow-on plans, intentional); §5 scanner exemption → documented in Task 13 + Phase 2 (enroll instruction block only); §6 testing/risk → per-task tests + Task 14 + risk note. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** primitive prop names are stable across tasks (`onCheckedChange`, `onValueChange`, `illustration`, `options/value`); illustration component names in Task 10 match those imported in Tasks 11–12 and listed in Task 13.
