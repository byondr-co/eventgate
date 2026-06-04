# Phase 5c — Auth & Public Edges Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final Phase-5 sub-phase — migrate the login form and walk-in info form to the `Field` kit, convert the public info page's not-found state to `EmptyState`, and tokenize the audit result chips (adding `--warning-foreground`).

**Architecture:** Presentational migration of `login-form`, `walkins/info-form` (twin of the Phase-4 registration form), the `info/[token]` server page, and the `audit` page's chip helper. One new token (`--warning-foreground`). The walk-in **claim** page and the **invites** page are out of scope (kept). All hooks/validation/logic preserved.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase5c-auth-public-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier — re-add and commit if it reformats. Branch `claude/phase5c-auth-public` (already created off `main`). Route-group paths contain `()[]` — quote them in `git add`.

## File Structure

**Modified:**
- `frontend/app/globals.css` — add `--warning-foreground`.
- `frontend/components/auth/login-form.tsx` — Field/Input.
- `frontend/components/walkins/info-form.tsx` — Field kit (twin of registration form).
- `frontend/app/(public)/e/[orgSlug]/[eventSlug]/info/[token]/page.tsx` — EmptyState not-found.
- `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx` — export + tokenize `resultClasses`.

**Tests created/modified:**
- `frontend/__tests__/theme/tokens.test.ts` (extend)
- Create: `frontend/__tests__/components/auth/login-form.test.tsx`, `frontend/__tests__/app/audit-result-classes.test.ts`
- Modify: `frontend/__tests__/components/walkins/info-form.test.tsx` (add 1 test)

---

## Task 1: Add the `--warning-foreground` token

**Files:**
- Modify: `app/globals.css`
- Test: `__tests__/theme/tokens.test.ts`

- [ ] **Step 1: Extend the test** — append inside the existing `describe("theme tokens", …)`:

```ts
  it("defines a warning-foreground token in both modes", () => {
    const occurrences = css.match(/--warning-foreground:/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("maps warning-foreground into the tailwind theme", () => {
    expect(css).toContain("--color-warning-foreground: var(--warning-foreground)");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Edit `app/globals.css`**

In `@theme inline`, immediately after `--color-warning: var(--warning);`, add:
```css
  --color-warning-foreground: var(--warning-foreground);
```
In `:root`, immediately after `--warning: oklch(0.72 0.16 75);`, add:
```css
  --warning-foreground: oklch(0.205 0 0);
```
In `.dark`, immediately after its `--warning: oklch(0.8 0.15 75);`, add:
```css
  --warning-foreground: oklch(0.205 0 0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/theme/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css __tests__/theme/tokens.test.ts
git commit -m "feat(theme): add warning-foreground token"
```

---

## Task 2: `login-form` → Field/Input

**Files:**
- Modify: `components/auth/login-form.tsx`
- Test: `__tests__/components/auth/login-form.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/auth/login-form.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ useRequestMagicLink: vi.fn() }));

import { LoginForm } from "@/components/auth/login-form";
import { useRequestMagicLink } from "@/lib/auth";

const mockReq = vi.mocked(useRequestMagicLink);

beforeEach(() => {
  vi.clearAllMocks();
  mockReq.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("LoginForm", () => {
  it("labels the email field via Field", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("data-slot", "input");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/auth/login-form.test.tsx`
Expected: FAIL (raw input, no label association / `data-slot`).

- [ ] **Step 3: Edit `components/auth/login-form.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
```

(b) Replace the email input:
```tsx
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
```
with:
```tsx
          <Field label="Email" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
```

Leave the "Check your inbox" success card, the `Button`, and the `useRequestMagicLink` flow unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/auth/login-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/auth/login-form.tsx __tests__/components/auth/login-form.test.tsx
git commit -m "feat(auth): migrate login form to Field/Input"
```

---

## Task 3: `WalkinInfoForm` → Field kit

**Files:**
- Modify: `components/walkins/info-form.tsx`
- Test: `__tests__/components/walkins/info-form.test.tsx` (add 1 test)

- [ ] **Step 1: Add a failing test** — append this `it` inside the existing top-level `describe` in `__tests__/components/walkins/info-form.test.tsx`. (The file already defines field fixtures `nameField` (required) and `companyField` (not required) and a `renderForm`/`wrap` helper — use the same render call the existing tests use; the snippet below assumes a `renderForm({ fields })`-style helper. If the existing tests render `<WalkinInfoForm … fields={[…]} />` directly, mirror that exact call.)

```tsx
  it("marks non-required fields Optional and leaves required ones unmarked", () => {
    // Render with a required field (Full name) and a non-required field (Company),
    // mirroring the existing tests' render call in this file.
    renderForm({ fields: [nameField, companyField] });
    const company = screen.getByText(/Company/).closest("label")!;
    expect(within(company).getByText("Optional")).toBeInTheDocument();
    const fullName = screen.getByText(/Full name/).closest("label")!;
    expect(within(fullName).queryByText("Optional")).not.toBeInTheDocument();
  });
```

Ensure `within` is in the testing-library import at the top of the file (add it if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/walkins/info-form.test.tsx -t "Optional"`
Expected: FAIL (current form uses a required `*`, no "Optional" marker).

- [ ] **Step 3: Overwrite `components/walkins/info-form.tsx`** with (logic identical; JSX migrated to the kit — mirrors the Phase-4 registration-form migration):

```tsx
"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicEventField } from "@/lib/events";
import { markInfoCompleted } from "@/lib/walkin-device";
import { useCompleteInfo } from "@/lib/walkins";

type Props = {
  orgSlug: string;
  eventSlug: string;
  token: string;
  eventName: string;
  fields: PublicEventField[];
  bannerImage?: string | null;
  description?: string;
};

/** Inside-hall info form for walk-in guests. Renders the event's registration
 *  fields data-driven (same as the public RegistrationForm, incl. banner) but
 *  submits to the walk-in info endpoint. First write wins server-side. */
export function WalkinInfoForm({
  orgSlug,
  eventSlug,
  token,
  eventName,
  fields,
  bannerImage,
  description,
}: Props) {
  const locale = useLocale();
  const complete = useCompleteInfo(orgSlug, eventSlug, token);

  // All fields sorted by order_index — driven entirely from props (no hardcoded presets).
  const sortedFields = (fields ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedFields.map((f) => [f.field_key, ""])),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const newFieldErrors: Record<string, string> = {};
    for (const f of sortedFields) {
      if (f.required && !(form[f.field_key] ?? "").trim()) {
        newFieldErrors[f.field_key] = "This field is required.";
      }
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      await complete.mutateAsync(form);
      // Clear the "complete your info" reminder shown on a re-scan.
      markInfoCompleted(orgSlug, eventSlug, token);
      setDone(true);
    } catch (err) {
      // useCompleteInfo surfaces the backend `detail` (already clean) or a status line.
      setFormError((err as Error).message);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thanks! Your info is saved.</CardTitle>
          <CardDescription>Enjoy {eventName}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {bannerImage ? <img src={bannerImage} alt="" className="h-40 w-full object-cover" /> : null}
      <CardHeader>
        <CardTitle>{eventName}</CardTitle>
        <CardDescription>
          {description ? description : "Please complete your info — it only takes a moment."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          {sortedFields.map((f) => {
            const fieldId = `field-${f.field_key}`;
            const value = form[f.field_key] ?? "";
            return (
              <Field
                key={f.field_key}
                label={label(f)}
                htmlFor={fieldId}
                optional={!f.required}
                error={fieldErrors[f.field_key]}
              >
                {f.field_type === "textarea" ? (
                  <Textarea
                    id={fieldId}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    rows={3}
                    aria-required={f.required}
                  />
                ) : f.field_type === "select" ? (
                  <Select
                    id={fieldId}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    aria-required={f.required}
                  >
                    <option value="" disabled>
                      Choose an option…
                    </option>
                    {(f.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={fieldId}
                    type={f.field_type === "email" ? "email" : "text"}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    aria-required={f.required}
                  />
                )}
              </Field>
            );
          })}

          <Button type="submit" className="w-full" disabled={complete.isPending}>
            {complete.isPending ? "Saving…" : "Save my info"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the whole test file**

Run: `pnpm exec vitest run __tests__/components/walkins/info-form.test.tsx`
Expected: PASS — the new "Optional" test plus all existing tests (`getByLabelText(/Full name/)`/`/Company/` via Field association; banner `<img>` kept; the required-empty inline error "This field is required." still renders via `Field`; `Save my info` button unchanged).

- [ ] **Step 5: Commit**

```bash
git add components/walkins/info-form.tsx __tests__/components/walkins/info-form.test.tsx
git commit -m "feat(walkins): migrate info form to the Field/Input/Select/Textarea kit"
```

---

## Task 4: `info/[token]` page → EmptyState

**Files:**
- Modify: `app/(public)/e/[orgSlug]/[eventSlug]/info/[token]/page.tsx`

Async server component — no unit test; verified by `tsc` + the `EmptyState` unit coverage.

- [ ] **Step 1: Edit the page**

(a) Add imports after the existing imports:
```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoEvents } from "@/lib/illustrations";
```

(b) Replace the not-found branch:
```tsx
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground">Event not found.</p>
      </main>
    );
```
with:
```tsx
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState illustration={NoEvents} title="Event not found" />
        </div>
      </main>
    );
```

Leave `loadEvent` and the open branch (renders `WalkinInfoForm`) unchanged.

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit` — expect clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/e/[orgSlug]/[eventSlug]/info/[token]/page.tsx"
git commit -m "feat(walkins): EmptyState for the info page not-found state"
```

---

## Task 5: `audit` page → tokenized result chips

**Files:**
- Modify: `app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`
- Test: `__tests__/app/audit-result-classes.test.ts` (create)

`resultClasses` is currently a module-level (non-exported) pure function. This task exports it and tokenizes its return values, then unit-tests it.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/audit-result-classes.test.ts
import { describe, expect, it } from "vitest";

import { resultClasses } from "@/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page";

describe("audit resultClasses", () => {
  it("maps results to semantic token classes", () => {
    expect(resultClasses("success")).toContain("bg-success");
    expect(resultClasses("success")).toContain("text-success-foreground");
    expect(resultClasses("warning")).toContain("bg-warning");
    expect(resultClasses("warning")).toContain("text-warning-foreground");
    expect(resultClasses("danger")).toContain("bg-destructive");
  });

  it("uses no hardcoded green/amber/red", () => {
    for (const r of ["success", "warning", "danger"] as const) {
      expect(resultClasses(r)).not.toMatch(/green-|amber-|red-/);
    }
  });
});
```

(Note: `AuditResult` is the union type from `@/lib/audit`; `"danger"` is the default branch. If the union's third member is named differently, the default branch still returns the destructive classes — the `"danger"` literal here exercises the `else` path.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/app/audit-result-classes.test.ts`
Expected: FAIL (`resultClasses` not exported / still returns green/amber/red).

- [ ] **Step 3: Edit `app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`** — change:
```tsx
function resultClasses(result: AuditResult): string {
  if (result === "success") return "bg-green-600 text-white";
  if (result === "warning") return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}
```
to:
```tsx
export function resultClasses(result: AuditResult): string {
  if (result === "success") return "bg-success text-success-foreground";
  if (result === "warning") return "bg-warning text-warning-foreground";
  return "bg-destructive text-white";
}
```

Leave the rest of the page (the prefix `Button` filters, the audit table, expand logic, `useAuditEvents`) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/app/audit-result-classes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx" __tests__/app/audit-result-classes.test.ts
git commit -m "feat(audit): tokenize result chips (success/warning/destructive)"
```

---

## Task 6: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green.

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (pre-existing `<img>` warnings — incl. login? no; the info-form banner `<img>` warning remains — acceptable); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Verify no leftover legacy colors in the touched files**

Run: `grep -rnE "green-[0-9]|amber-[0-9]|red-[0-9]|focus:ring-2" components/auth/login-form.tsx components/walkins/info-form.tsx "app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx"`
Expected: no matches.

- [ ] **Step 4: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(5c): format auth/public adoption"
```

---

## Self-Review

- **Spec coverage:** §A `--warning-foreground` → Task 1; §B login-form → Task 2; §C WalkinInfoForm → Task 3; §D info page EmptyState → Task 4; §E audit chips → Task 5; testing/gate → per-task tests + Task 6. Claim + invites pages intentionally untouched (out of scope). Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code or exact find/replace. The Task 3 test note instructs mirroring the existing file's render call — the implementer must read the existing test's render helper; the assertion code itself is complete.
- **Type consistency:** `--warning-foreground`/`--color-warning-foreground` names match token + theme map + test; `resultClasses` exported name matches the test import; `Field`/`Input`/`Select`/`Textarea`/`EmptyState`/`NoEvents` import paths match the foundation; the WalkinInfoForm migration preserves `field-${field_key}` id pairing, `noValidate`, the form-level `role="alert"`, the banner `<img>`, and the `done` card — keeping the existing info-form test green.
