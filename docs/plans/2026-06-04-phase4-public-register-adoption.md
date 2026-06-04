# Phase 4 — Public Register Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the monochrome design system on the public registration flow — migrate `RegistrationForm` to the `Field`/`Input`/`Select`/`Textarea` kit, add a confirmation illustration to the success card, convert the register page's edge states to `EmptyState`, and make the Telegram link a `Button`.

**Architecture:** Presentational migration using merged primitives. The form keeps all logic (validation, routing, i18n, `useRegisterPublic`); `Field` takes over a11y wiring and the required→Optional marker. One new thin-line illustration (`Registered`) is added to the foundation lib. Two async server pages get presentational swaps verified by typecheck.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase4-public-register-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier — re-add and commit if it reformats. Branch `claude/phase4-public-register-adoption` (already created off `main`). Route-group paths contain `()[]` — **quote them** in `git add`.

## File Structure

**Modified:**
- `frontend/lib/illustrations/flow.tsx` — add `Registered`.
- `frontend/components/guests/registration-form.tsx` — fields → Field kit.
- `frontend/components/guests/registration-success.tsx` — add confirmation illustration.
- `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx` — Telegram link → `Button`.
- `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` — edge states → `EmptyState`.

**Test created/modified:**
- `frontend/__tests__/lib/illustrations.test.tsx` (extend)
- `frontend/__tests__/components/guests/registration-form.test.tsx` (add 1 + adjust import)
- `frontend/__tests__/components/guests/registration-success.test.tsx` (create)

---

## Task 1: Add the `Registered` illustration

**Files:**
- Modify: `lib/illustrations/flow.tsx`
- Test: `__tests__/lib/illustrations.test.tsx`

- [ ] **Step 1: Update the test** — in `__tests__/lib/illustrations.test.tsx`, add `"Registered"` to the `NAMES` array (e.g. after `"WalkinInfo"`):

```tsx
  "WalkinInfo",
  "Registered",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/lib/illustrations.test.tsx`
Expected: FAIL — the `Registered` case fails (`expect(Comp).toBeTypeOf("function")` — export doesn't exist yet).

- [ ] **Step 3: Edit `lib/illustrations/flow.tsx`** — add this export (after `WalkinInfo`, using the existing `base()` helper):

```tsx
export function Registered({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>,
    className,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/lib/illustrations.test.tsx`
Expected: PASS (12 cases now).

- [ ] **Step 5: Commit**

```bash
git add lib/illustrations/flow.tsx __tests__/lib/illustrations.test.tsx
git commit -m "feat(ui): add Registered confirmation illustration"
```

---

## Task 2: `RegistrationForm` → Field kit

**Files:**
- Modify: `components/guests/registration-form.tsx`
- Test: `__tests__/components/guests/registration-form.test.tsx`

- [ ] **Step 1: Add a failing test** — in `__tests__/components/guests/registration-form.test.tsx`:

(a) Change the testing-library import line to include `within`:
```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

(b) Append this describe block:
```tsx
describe("RegistrationForm optional markers", () => {
  it("marks non-required fields Optional and leaves required ones unmarked", () => {
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, phoneField]}
      />,
    );
    const phoneLabel = screen.getByText(/phone or chat/i).closest("label")!;
    expect(within(phoneLabel).getByText("Optional")).toBeInTheDocument();
    const nameLabel = screen.getByText(/full name/i).closest("label")!;
    expect(within(nameLabel).queryByText("Optional")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/registration-form.test.tsx -t "optional markers"`
Expected: FAIL (current form has no "Optional" marker; required fields use a `*`).

- [ ] **Step 3: Overwrite `components/guests/registration-form.tsx`** with (logic identical; JSX migrated to the kit):

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractFieldErrors } from "@/lib/api";
import type { PublicEventField } from "@/lib/events";
import { useRegisterPublic } from "@/lib/guests";

type Props = {
  orgSlug: string;
  eventSlug: string;
  eventName: string;
  venue?: string;
  fields?: PublicEventField[];
  bannerImage?: string | null;
  description?: string;
};

export function RegistrationForm({
  orgSlug,
  eventSlug,
  eventName,
  venue,
  fields,
  bannerImage,
  description,
}: Props) {
  const t = useTranslations("register");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const register = useRegisterPublic(orgSlug, eventSlug);

  // All fields sorted by order_index — driven entirely from props.
  const sortedFields = (fields ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  // Initialise form state from the field list.
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedFields.map((f) => [f.field_key, ""])),
  );

  // Inline errors: one per field_key + an optional form-level message.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side required validation.
    const newFieldErrors: Record<string, string> = {};
    for (const f of sortedFields) {
      if (f.required && !(form[f.field_key] ?? "").trim()) {
        newFieldErrors[f.field_key] = t("fieldRequired");
      }
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      const { guest_id, entry_token } = await register.mutateAsync({
        ...form,
        ...(ref ? { ref } : {}),
      });
      router.push(
        `/e/${orgSlug}/${eventSlug}/registered/${guest_id}?token=${encodeURIComponent(entry_token)}`,
      );
    } catch (err) {
      const { fieldErrors: fe, formError: fe2 } = extractFieldErrors(err);
      setFieldErrors(fe);
      setFormError(fe2);
    }
  };

  return (
    <Card className="overflow-hidden">
      {bannerImage ? <img src={bannerImage} alt="" className="h-40 w-full object-cover" /> : null}
      <CardHeader>
        <CardTitle>{t("title", { eventName })}</CardTitle>
        <CardDescription>{description ? description : venue ? venue : t("subtitle")}</CardDescription>
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
                      {t("selectPlaceholder")}
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

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the whole test file**

Run: `pnpm exec vitest run __tests__/components/guests/registration-form.test.tsx`
Expected: PASS — the new "optional markers" test plus ALL existing tests (label/control association via `htmlFor`/`id`, `combobox`/`textbox` roles, `noValidate`, required-validation error counts, the field-level and form-level `role="alert"` errors are all preserved by `Field`).

- [ ] **Step 5: Commit**

```bash
git add components/guests/registration-form.tsx __tests__/components/guests/registration-form.test.tsx
git commit -m "feat(register): migrate RegistrationForm to the Field/Input/Select/Textarea kit"
```

---

## Task 3: Success card → confirmation illustration

**Files:**
- Modify: `components/guests/registration-success.tsx`
- Test: `__tests__/components/guests/registration-success.test.tsx` (create)

- [ ] **Step 1: Write the failing test** at `__tests__/components/guests/registration-success.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { RegistrationSuccess } from "@/components/guests/registration-success";

describe("RegistrationSuccess", () => {
  it("renders a confirmation illustration and the title", () => {
    const { container } = render(<RegistrationSuccess />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("success_title")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/guests/registration-success.test.tsx`
Expected: FAIL (current success card renders no `<svg>`).

- [ ] **Step 3: Overwrite `components/guests/registration-success.tsx`** with:

```tsx
"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Registered } from "@/lib/illustrations";

export function RegistrationSuccess() {
  const t = useTranslations("register");
  return (
    <Card>
      <CardHeader className="text-center">
        <Registered className="mx-auto size-10 text-success" />
        <CardTitle>{t("success_title")}</CardTitle>
        <CardDescription>{t("success_email_note")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">{t("success_check_spam")}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/guests/registration-success.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/guests/registration-success.tsx __tests__/components/guests/registration-success.test.tsx
git commit -m "feat(register): add confirmation illustration to the success card"
```

---

## Task 4: Registered page → Telegram `Button`

**Files:**
- Modify: `app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`

Presentational swap in an async server component (no unit test; verified by `tsc` + the `Button` unit coverage). `Button` (Base UI) establishes its own client boundary, so it renders fine inside this server component.

- [ ] **Step 1: Edit the page** — add the import and replace the link.

Add the import (with the existing import):
```tsx
import { Button } from "@/components/ui/button";
```

Replace:
```tsx
          <a
            href={`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`}
            className="inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get on Telegram
          </a>
```
with:
```tsx
          <Button
            variant="outline"
            className="w-full"
            render={
              <a
                href={`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Get on Telegram
          </Button>
```
Keep the `botUsername && token` guard and the surrounding layout unchanged.

- [ ] **Step 2: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && pnpm exec tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx"
git commit -m "feat(register): use Button for the Get-on-Telegram link"
```

---

## Task 5: Register page edge states → `EmptyState`

**Files:**
- Modify: `app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`

Presentational swap in an async server component (no unit test; verified by `tsc` + the `EmptyState` unit coverage). `EmptyState` and illustrations are plain components, valid in a server component.

- [ ] **Step 1: Edit the page** — add imports and replace the two edge-state branches.

Add imports (with the existing imports):
```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoEvents } from "@/lib/illustrations";
```

Replace the not-found branch:
```tsx
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground">{t("eventNotFound")}</p>
      </main>
    );
```
with:
```tsx
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState illustration={NoEvents} title={t("eventNotFound")} />
        </div>
      </main>
    );
```

Replace the registration-closed branch:
```tsx
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{event.name}</h1>
          {event.venue ? <p className="mt-1 text-sm text-muted-foreground">{event.venue}</p> : null}
          <p className="mt-4 text-sm text-muted-foreground">{t("registrationClosed")}</p>
        </div>
      </main>
    );
```
with:
```tsx
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState
            illustration={NoEvents}
            title={event.name}
            message={
              event.venue
                ? `${event.venue} · ${t("registrationClosed")}`
                : t("registrationClosed")
            }
          />
        </div>
      </main>
    );
```
Keep `loadEvent`, `getTranslations`, and the open-registration branch (the `RegistrationForm`) unchanged.

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx"
git commit -m "feat(register): EmptyState for not-found and registration-closed states"
```

---

## Task 6: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green.

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (the banner `<img>` warning in `registration-form.tsx`, plus the other 2 pre-existing `<img>` warnings, remain — acceptable); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(register): format Phase 4 adoption"
```

---

## Self-Review

- **Spec coverage:** §E new `Registered` illustration → Task 1; §A form → Field kit → Task 2; §B success illustration → Task 3; §C Telegram Button → Task 4; §D edge states → Task 5; §F banner `<img>` left as-is (explicitly unchanged in Task 2's full file); testing/gate → per-task tests + Task 6. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code or an exact find/replace.
- **Type consistency:** `Registered` defined in Task 1, imported in Task 3; `fieldId = field-${f.field_key}` matches the `htmlFor`/`id` pairing Field relies on; `optional={!f.required}` and `error={fieldErrors[f.field_key]}` use existing state; `Field`/`Input`/`Select`/`Textarea`/`Button`/`EmptyState`/`NoEvents` import paths match the merged foundation; the form-level error keeps `role="alert"` (asserted by an existing test). The `within` import is added in Task 2 before use.
