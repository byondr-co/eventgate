# PR1 — a11y + dark-mode (theme toggle + a11y test infra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark/system theme toggle and bring the unified UI to WCAG 2.1 AA, backed by a layered a11y test harness (vitest-axe + @axe-core/playwright).

**Architecture:** Wire `next-themes` (already a dependency) into the existing client `Providers`; expose a `ThemeToggle` built on the existing `SegmentedControl` in the authenticated app-shell header. Audit/fix a11y primitives-first (fixes propagate to all routes), driven by axe tests. Contrast is verified in a real browser via Playwright in both themes; structural a11y via vitest-axe in the unit loop.

**Tech Stack:** Next.js (App Router — non-standard build, see note), React, `next-themes@^0.4.6`, `@base-ui/react`, Tailwind tokens in `globals.css`, vitest + @testing-library/react + jsdom, Playwright + @axe-core/playwright, `vitest-axe`.

---

## ⚠️ Pre-flight (read before any task)

- This is **not** stock Next.js. `frontend/AGENTS.md` warns the bundled Next has breaking changes vs. training data. Before editing `app/layout.tsx` / `app/providers.tsx`, skim the relevant guide under `frontend/node_modules/next/dist/docs/`.
- All commands run from `frontend/` after `source ~/.nvm/nvm.sh && nvm use 20`.
- Merge gate (run before the PR): `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. The Playwright axe suite (`pnpm test:e2e`) runs separately (it boots the app) and is NOT part of the four-command gate.
- Commits: single-line conventional, **no `Co-Authored-By` trailer**.
- Accepted pre-existing: 3 `<img>` lint warnings.

## File Structure

- `frontend/package.json` — add dev deps `vitest-axe`, `@axe-core/playwright`.
- `frontend/vitest.setup.ts` — register the axe matcher.
- `frontend/types/vitest-axe.d.ts` (create) — type augmentation for `toHaveNoViolations`.
- `frontend/components/ui/segmented-control.tsx` — widen `label` to `ReactNode` (enables icon labels).
- `frontend/app/providers.tsx` — mount `ThemeProvider`.
- `frontend/app/layout.tsx` — add `suppressHydrationWarning` to `<html>`.
- `frontend/components/common/theme-toggle.tsx` (create) — the toggle.
- `frontend/app/(app)/layout.tsx` — mount `ThemeToggle`, add skip-to-content link + `id="main"`.
- `frontend/components/ui/__tests__/*` and `frontend/__tests__/**` — vitest-axe tests.
- `frontend/playwright.config.ts` — add `webServer`.
- `frontend/tests/a11y.spec.ts` (create) — dual-theme axe + keyboard traversal.
- `frontend/app/globals.css` — token contrast fixes (only if axe flags contrast).
- `frontend/docs/ui-style-note.md` — document theme toggle + a11y expectations.

---

### Task 1: vitest-axe harness + proof test

**Files:**
- Modify: `frontend/package.json` (dev deps)
- Modify: `frontend/vitest.setup.ts`
- Create: `frontend/types/vitest-axe.d.ts`
- Create: `frontend/components/ui/__tests__/a11y-harness.test.tsx`

- [ ] **Step 1: Install the dev dependency**

Run: `pnpm add -D vitest-axe`
Expected: `vitest-axe` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Register the matcher in the vitest setup**

Edit `frontend/vitest.setup.ts` to:

```ts
import "@testing-library/jest-dom/vitest";
import * as axeMatchers from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend(axeMatchers);
```

- [ ] **Step 3: Add the matcher type augmentation**

Create `frontend/types/vitest-axe.d.ts`:

```ts
import "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
```

If `vitest-axe/matchers` does not export `AxeMatchers` in the installed version, declare the single method instead:

```ts
import "vitest";
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}
```

- [ ] **Step 4: Write the proof test**

Create `frontend/components/ui/__tests__/a11y-harness.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "@/components/ui/button";

describe("a11y harness", () => {
  it("reports no axe violations for a labelled Button", async () => {
    const { container } = render(<Button>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 5: Run the proof test**

Run: `pnpm test -- a11y-harness`
Expected: PASS (1 test). If it errors on the matcher type, fix the `.d.ts` per Step 3's fallback.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

```bash
git add package.json pnpm-lock.yaml vitest.setup.ts types/vitest-axe.d.ts components/ui/__tests__/a11y-harness.test.tsx
git commit -m "test(a11y): add vitest-axe harness and matcher types"
```

---

### Task 2: Primitive a11y sweep (axe over each primitive) + fixes

**Files:**
- Create: `frontend/components/ui/__tests__/primitives-a11y.test.tsx`
- Modify (only if axe flags): the relevant primitive in `frontend/components/ui/*`

- [ ] **Step 1: Write the failing/again-passing axe sweep test**

Create `frontend/components/ui/__tests__/primitives-a11y.test.tsx`. Each primitive is rendered in a representative, fully-labelled state and asserted axe-clean:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Slider } from "@/components/ui/slider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

async function expectClean(ui: React.ReactElement) {
  const { container } = render(ui);
  expect(await axe(container)).toHaveNoViolations();
}

describe("primitive a11y", () => {
  it("Field + Input has an associated label", async () => {
    await expectClean(
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" />
      </Field>,
    );
  });

  it("Field + Textarea has an associated label", async () => {
    await expectClean(
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" />
      </Field>,
    );
  });

  it("Toggle exposes a name", async () => {
    await expectClean(<Toggle aria-label="Enable walk-ins" checked={false} onCheckedChange={() => {}} />);
  });

  it("Slider exposes a name", async () => {
    await expectClean(<Slider aria-label="Capacity" value={50} onValueChange={() => {}} />);
  });

  it("SegmentedControl group is labelled", async () => {
    await expectClean(
      <SegmentedControl
        aria-label="Filter guests"
        options={[
          { value: "all", label: "All" },
          { value: "walkin", label: "Walk-in" },
        ]}
        value="all"
        onValueChange={() => {}}
      />,
    );
  });

  it("Button is axe-clean", async () => {
    await expectClean(<Button>Continue</Button>);
  });

  it("Badge is axe-clean", async () => {
    await expectClean(<Badge>New</Badge>);
  });

  it("EmptyState is axe-clean", async () => {
    await expectClean(<EmptyState title="No guests yet" description="Add your first guest." />);
  });
});
```

> NOTE: match each primitive's real prop API. If a prop name above differs from the actual component (e.g. `Toggle`/`Slider`/`Select`/`EmptyState`), open the component file and adjust the test to the real props before running. Do not change a primitive's API to fit the test.

- [ ] **Step 2: Run the sweep**

Run: `pnpm test -- primitives-a11y`
Expected: some PASS; record any FAIL with the axe rule id (e.g. `label`, `button-name`, `aria-*`).

- [ ] **Step 3: Fix each violation at the primitive level**

For every failure, fix the **primitive** (add/forward `aria-*`, associate labels, set roles). Make the minimal change that satisfies the axe rule without altering visual design. Re-run after each fix.

- [ ] **Step 4: Verify green**

Run: `pnpm test -- primitives-a11y`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add components/ui
git commit -m "test(a11y): axe sweep across UI primitives; fix any structural violations"
```

---

### Task 3: Dialog accessible-name + keyboard behavior

`Dialog` wraps `@base-ui/react` (focus-trap/Esc/return-focus are provided by Base UI). This task locks that behavior in and guarantees an accessible name via `DialogTitle`.

**Files:**
- Create: `frontend/components/ui/__tests__/dialog-a11y.test.tsx`
- Modify (only if a test fails): `frontend/components/ui/dialog.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/components/ui/__tests__/dialog-a11y.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm</DialogTitle>
          <DialogDescription>Are you sure?</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog a11y", () => {
  it("opens with an accessible name and is axe-clean", async () => {
    const { container } = render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Confirm");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("closes on Escape", async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test -- dialog-a11y`
Expected: PASS. If accessible-name fails, ensure `DialogContent`/`Popup` references the title (Base UI wires `aria-labelledby` from `DialogTitle` — confirm `DialogTitle` is rendered inside `DialogContent`). Fix in `dialog.tsx` only if a wiring gap exists.

- [ ] **Step 3: Commit**

```bash
git add components/ui/__tests__/dialog-a11y.test.tsx components/ui/dialog.tsx
git commit -m "test(a11y): assert Dialog accessible name and Escape-to-close"
```

---

### Task 4: Widen SegmentedControl label to ReactNode

Enables icon+text options for the theme toggle without breaking existing string-label callers.

**Files:**
- Modify: `frontend/components/ui/segmented-control.tsx`
- Modify: `frontend/__tests__/components/ui/segmented-control.test.tsx`

- [ ] **Step 1: Add a failing test for a node label**

Append to `frontend/__tests__/components/ui/segmented-control.test.tsx`:

```tsx
it("renders a ReactNode label while keeping the accessible name from text", () => {
  render(
    <SegmentedControl
      options={[
        { value: "light", label: <span><span aria-hidden="true">☀</span> Light</span> },
        { value: "dark", label: <span><span aria-hidden="true">☾</span> Dark</span> },
      ]}
      value="light"
      onValueChange={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run to verify it fails to typecheck/render**

Run: `pnpm exec tsc --noEmit`
Expected: TS error — `label` is typed `string`, not assignable from `ReactNode`.

- [ ] **Step 3: Widen the type**

In `frontend/components/ui/segmented-control.tsx`, add the import and change the `Option` type:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: ReactNode };
```

(Leave the rest unchanged — `{opt.label}` already renders a node.)

- [ ] **Step 4: Run**

Run: `pnpm exec tsc --noEmit && pnpm test -- segmented-control`
Expected: typecheck clean; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/segmented-control.tsx __tests__/components/ui/segmented-control.test.tsx
git commit -m "feat(ui): allow ReactNode labels in SegmentedControl"
```

---

### Task 5: Mount next-themes ThemeProvider

**Files:**
- Modify: `frontend/app/providers.tsx`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/__tests__/providers-theme.test.tsx`

- [ ] **Step 1: Write the test (provider exposes theme context)**

Create `frontend/app/__tests__/providers-theme.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "next-themes";

import { Providers } from "@/app/providers";

function ThemeProbe() {
  const { themes } = useTheme();
  return <span data-testid="themes">{themes.join(",")}</span>;
}

describe("Providers theme integration", () => {
  it("provides next-themes context to children", () => {
    render(
      <Providers>
        <ThemeProbe />
      </Providers>,
    );
    expect(screen.getByTestId("themes").textContent).toContain("dark");
    expect(screen.getByTestId("themes").textContent).toContain("light");
    expect(screen.getByTestId("themes").textContent).toContain("system");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- providers-theme`
Expected: FAIL — `themes` is `["light","dark"]` only when no provider, or context default; the `system` entry is absent until `ThemeProvider` with `enableSystem` wraps children.

- [ ] **Step 3: Add the provider**

Edit `frontend/app/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Add suppressHydrationWarning to `<html>`**

In `frontend/app/layout.tsx`, add `suppressHydrationWarning` to the `<html>` tag:

```tsx
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm test -- providers-theme && pnpm exec tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/providers.tsx app/layout.tsx app/__tests__/providers-theme.test.tsx
git commit -m "feat(theme): mount next-themes ThemeProvider (light/dark/system)"
```

---

### Task 6: ThemeToggle component

**Files:**
- Create: `frontend/components/common/theme-toggle.tsx`
- Create: `frontend/components/common/__tests__/theme-toggle.test.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/components/common/__tests__/theme-toggle.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme, themes: ["light", "dark", "system"] }),
}));

import { ThemeToggle } from "@/components/common/theme-toggle";

describe("ThemeToggle", () => {
  it("renders three labelled options after mount and is axe-clean", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await screen.findByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls setTheme when an option is chosen", async () => {
    render(<ThemeToggle />);
    fireEvent.click(await screen.findByRole("button", { name: /dark/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- theme-toggle`
Expected: FAIL — module `@/components/common/theme-toggle` not found.

- [ ] **Step 3: Implement the component**

Create `frontend/components/common/theme-toggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react";

import { SegmentedControl } from "@/components/ui/segmented-control";

type ThemeValue = "light" | "dark" | "system";

const OPTIONS: { value: ThemeValue; label: React.ReactNode }[] = [
  {
    value: "light",
    label: (
      <span className="flex items-center gap-1.5">
        <SunIcon className="size-4" aria-hidden="true" />
        Light
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="flex items-center gap-1.5">
        <MoonIcon className="size-4" aria-hidden="true" />
        Dark
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="flex items-center gap-1.5">
        <MonitorIcon className="size-4" aria-hidden="true" />
        System
      </span>
    ),
  },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Avoid SSR/client mismatch: reserve space until the resolved theme is known.
    return <div className={className} style={{ height: "2rem", width: "13rem" }} aria-hidden="true" />;
  }

  return (
    <SegmentedControl
      aria-label="Color theme"
      className={className}
      options={OPTIONS}
      value={(theme as ThemeValue) ?? "system"}
      onValueChange={(next) => setTheme(next)}
    />
  );
}
```

- [ ] **Step 4: Run**

Run: `pnpm test -- theme-toggle`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/theme-toggle.tsx components/common/__tests__/theme-toggle.test.tsx
git commit -m "feat(theme): add light/dark/system ThemeToggle"
```

---

### Task 7: Mount ThemeToggle + skip-to-content in the app shell

**Files:**
- Modify: `frontend/app/(app)/layout.tsx`
- Create: `frontend/__tests__/app/app-shell-a11y.test.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/__tests__/app/app-shell-a11y.test.tsx`. Mock auth hooks so the layout renders in isolation:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn(), themes: ["light", "dark", "system"] }),
}));
vi.mock("@/lib/auth", () => ({
  useMe: () => ({ data: { email: "a@b.co" } }),
  useLogout: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/auth-refresh", () => ({
  SessionRefreshProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import AppLayout from "@/app/(app)/layout";

describe("app shell a11y", () => {
  it("renders a skip-to-content link targeting #main", () => {
    render(<AppLayout><div>content</div></AppLayout>);
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("renders the theme toggle", () => {
    render(<AppLayout><div>content</div></AppLayout>);
    expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- app-shell-a11y`
Expected: FAIL — no skip link, no theme toggle.

- [ ] **Step 3: Edit the layout**

In `frontend/app/(app)/layout.tsx`: add the import, a skip link as the first child of the outer `div`, the `ThemeToggle` in the header actions, and `id="main"` + `tabIndex={-1}` on `<main>`:

```tsx
import { ThemeToggle } from "@/components/common/theme-toggle";
```

Skip link (first element inside the `min-h-screen` wrapper, before `<header>`):

```tsx
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
        >
          Skip to content
        </a>
```

In the header actions `div` (next to the email/Sign out), add:

```tsx
              <ThemeToggle />
```

On `<main>`:

```tsx
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl w-full flex-1 px-6 py-8">
          {children}
        </main>
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm test -- app-shell-a11y && pnpm exec tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" __tests__/app/app-shell-a11y.test.tsx
git commit -m "feat(theme): mount ThemeToggle and add skip-to-content in app shell"
```

---

### Task 8: Playwright dual-theme axe sweep + token contrast fixes

**Files:**
- Modify: `frontend/package.json` (dev dep)
- Modify: `frontend/playwright.config.ts` (add `webServer`)
- Create: `frontend/tests/a11y.spec.ts`
- Modify (only if contrast flagged): `frontend/app/globals.css`

- [ ] **Step 1: Install the dev dependency**

Run: `pnpm add -D @axe-core/playwright`
Expected: appears under `devDependencies`.

- [ ] **Step 2: Add a webServer to the Playwright config**

Edit `frontend/playwright.config.ts` to add (inside `defineConfig({...})`):

```ts
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
```

- [ ] **Step 3: Write the dual-theme axe spec**

Create `frontend/tests/a11y.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SERIOUS = new Set(["serious", "critical"]);

for (const theme of ["light", "dark"] as const) {
  test(`login page has no serious/critical axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ""));
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
```

- [ ] **Step 4: Run the axe spec**

Run: `pnpm exec playwright test a11y --project=chromium`
Expected: it boots `pnpm dev`, loads `/login` in both themes, and reports axe results. Record any `serious`/`critical` violations (the assertion message prints them).

> If Playwright browsers are not installed: `pnpm exec playwright install chromium` first.

- [ ] **Step 5: Fix contrast/structural violations at the token level**

For each contrast violation, adjust the offending token pair in `frontend/app/globals.css` — in the **`.dark` block** and/or the light `:root` block as flagged — so the foreground/background pair meets AA (4.5:1 body, 3:1 large text). Keep the monochrome-with-semantic-accents language; nudge lightness, don't introduce new hues. Re-run Step 4 until green.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/a11y.spec.ts app/globals.css
git commit -m "test(a11y): dual-theme Playwright axe sweep; fix token contrast"
```

---

### Task 9: Playwright keyboard traversal on login

**Files:**
- Modify: `frontend/tests/a11y.spec.ts`

- [ ] **Step 1: Add the keyboard traversal test**

Append to `frontend/tests/a11y.spec.ts`:

```ts
test("login form is reachable and operable by keyboard with visible focus", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Tab from the document into the first interactive control.
  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toBeVisible();

  // The focused element must expose a visible focus indicator (ring/outline).
  const outlineStyles = await active.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, boxShadow: s.boxShadow };
  });
  expect(
    outlineStyles.outline !== "none" || outlineStyles.boxShadow !== "none",
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run**

Run: `pnpm exec playwright test a11y --project=chromium`
Expected: PASS (3 tests: light axe, dark axe, keyboard). Fix focus-visibility regressions in the relevant primitive if this fails.

- [ ] **Step 3: Commit**

```bash
git add tests/a11y.spec.ts
git commit -m "test(a11y): assert keyboard reachability and visible focus on login"
```

---

### Task 10: Document + add e2e script + final gate

**Files:**
- Modify: `frontend/docs/ui-style-note.md`
- Modify: `frontend/package.json` (script convenience, optional)

- [ ] **Step 1: Document theme + a11y expectations**

Append a short section to `frontend/docs/ui-style-note.md`:

```markdown
## Theme & accessibility

- Theme is light/dark/system via `next-themes` (`attribute="class"`). The `ThemeToggle`
  (`components/common/theme-toggle.tsx`) lives in the authenticated app-shell header;
  public/auth/scanner routes inherit the resolved theme (scanner forces its own).
- a11y target is WCAG 2.1 AA. Structural a11y is asserted with `vitest-axe` in unit tests;
  color contrast and keyboard/focus are asserted in a real browser via `@axe-core/playwright`
  (`tests/a11y.spec.ts`, run with `pnpm test:e2e` — needs the app booted).
- Color carries meaning only; fix contrast at the token level in `app/globals.css`, never per-page.
```

- [ ] **Step 2: Run the full merge gate**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: tests PASS; typecheck clean; lint shows only the 3 accepted `<img>` warnings; format clean.

If `format:check` fails: run `pnpm exec prettier --write .` then re-check.

- [ ] **Step 3: Run the e2e a11y suite once more**

Run: `pnpm test:e2e -- a11y`
Expected: 3 a11y tests PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/ui-style-note.md package.json
git commit -m "docs(a11y): document theme toggle and a11y verification approach"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** theme toggle (T5–T7) ✓; provider lights up existing Sonner theming (T5) ✓; primitives-first a11y (T2–T3) ✓; WCAG AA (T2, T8 axe tags) ✓; token-level contrast (T8) ✓; vitest-axe layer (T1–T3, T6–T7) ✓; @axe-core/playwright dual-theme + keyboard (T8–T9) ✓; gate unchanged, e2e separate (T10) ✓; scanner excluded from toggle (T6 component is opt-in; only mounted in app shell — T7) ✓. PRs 2–4 intentionally out of this plan.
- **Placeholder scan:** none — every code step has concrete content. The two contingent fix steps (T2 Step 3, T8 Step 5) are test-driven: the axe assertion is the spec and must end green.
- **Type consistency:** `ThemeValue` ("light"|"dark"|"system") consistent across T6; `Option.label: ReactNode` (T4) consumed by `ThemeToggle` (T6); `useTheme()` shape (`theme`/`setTheme`/`themes`) consistent across T5–T7 mocks.

## Notes for the executor

- Prop names in the Task 2 axe sweep are illustrative — open each primitive and match its real API before running (the NOTE in T2 Step 1 says so). Adjust the test, never the primitive's public API, to fit.
- If `pnpm dev` can't fully boot under Playwright due to backend calls on `/login`, the page still renders its form client-side; the axe/keyboard assertions target the rendered form and do not require backend responses.
- Keep each commit green. If a contingent fix (contrast/structural) turns out empty (no violations found), skip the fix step and note "no violations" in the commit body is unnecessary — just commit the test additions.
