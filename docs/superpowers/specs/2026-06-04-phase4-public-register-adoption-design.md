# Design — Phase 4: Public Register Adoption (monochrome design system)

**Date:** 2026-06-04
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstormed with Vinei

## Goal

Adopt the monochrome design-system foundation on the attendee-facing public registration
flow: migrate the data-driven `RegistrationForm` to the `Field`/`Input`/`Select`/`Textarea`
kit (gaining Field's automatic a11y wiring), add a confirmation illustration to the success
card, convert the register page's not-found / closed edge states to `EmptyState`, and make
the "Get on Telegram" link a `Button`. One new thin-line illustration (`Registered`) is added.

## Scope (approved decisions)

| Decision | Choice |
|---|---|
| Required-field marker | **Drop the red `*`; use Field's "Optional" marker** on non-required fields (`optional={!f.required}`). |
| Confirmation + edge states | **Full instructive treatment** — success illustration + `EmptyState` for closed/not-found + Telegram `Button`. |
| Banner `<img>` | **Left as-is** (out of scope — `next/image` needs remote-host config for presigned Tigris URLs; the pre-existing lint *warning* stays). |
| Async server pages | Verified via `tsc`/build + primitive unit coverage; no bespoke async-server-component unit test. |

## Foundation building blocks (on `main`, PRs #60–#63)

- `@/components/ui/field` — `Field` auto-wires `aria-invalid` + `aria-describedby={`${htmlFor}-error`}` onto its single child when `error` is set; `optional` prop renders an "Optional" marker; `label` is a `ReactNode`.
- `@/components/ui/input`, `@/components/ui/select` (native, chevron), `@/components/ui/textarea` (resize-y), `@/components/ui/button` (Base UI, supports `render` for polymorphism), `@/components/ui/empty-state`.
- `@/lib/illustrations` — `NoEvents` (calendar), plus the new `Registered` added here.
- Tokens: `text-success` (green semantic), `text-destructive`, greyscale elsewhere.

## Files

- `frontend/components/guests/registration-form.tsx` — the main migration.
- `frontend/components/guests/registration-success.tsx` — add confirmation illustration.
- `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx` — Telegram link → `Button`.
- `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` — edge states → `EmptyState`.
- `frontend/lib/illustrations/flow.tsx` (+ `index` already re-exports) — add `Registered`.
- Tests: `frontend/__tests__/components/guests/registration-form.test.tsx` (add one), `frontend/__tests__/components/guests/registration-success.test.tsx` (create), `frontend/__tests__/lib/illustrations.test.tsx` (extend).

## Section A — `RegistrationForm` → Field kit

In `components/guests/registration-form.tsx`:
- Add imports: `Field` (`@/components/ui/field`), `Input` (`@/components/ui/input`), `Select` (`@/components/ui/select`), `Textarea` (`@/components/ui/textarea`).
- Remove the local `inputClass` / `errorClass` consts.
- For each `sortedFields` entry, render:
  ```tsx
  <Field
    key={f.field_key}
    label={label(f)}
    htmlFor={fieldId}
    optional={!f.required}
    error={fieldErrors[f.field_key]}
  >
    {/* control by field_type */}
  </Field>
  ```
  where `fieldId = field-${f.field_key}`, and the control is:
  - `textarea` → `<Textarea id={fieldId} value={…} onChange={…} rows={3} aria-required={f.required} />`
  - `select` → `<Select id={fieldId} value={…} onChange={…} aria-required={f.required}>` with the existing disabled placeholder `<option value="" disabled>{t("selectPlaceholder")}</option>` + the `f.options` options.
  - else → `<Input id={fieldId} type={f.field_type === "email" ? "email" : "text"} value={…} onChange={…} aria-required={f.required} />`
- Drop the manual `aria-describedby` on controls and the hand-rolled per-field error `<p id="${fieldId}-error">` — `Field` owns both now (it renders the error `<p role="alert">` and wires `aria-describedby`).
- Drop the required `*` span (the "Optional" marker replaces the convention).
- **Preserve unchanged:** the `Card` wrapper + banner `<img>`, `CardHeader`/`CardTitle`/`CardDescription`, the form `noValidate`, the form-level `formError` rendered as `<p className="text-sm text-destructive" role="alert">` at the top of the form, the client-side required validation, the submit `<Button type="submit" className="w-full">`, `useRegisterPublic`, `extractFieldErrors`, routing, and i18n.

## Section B — Success card → confirmation illustration

In `components/guests/registration-success.tsx`:
- Add the `Registered` illustration centered at the top of the card (e.g. inside `CardHeader`, above the title): `<Registered className="mx-auto size-10 text-success" />`. Center the title/description (`text-center`).
- Keep the `Card`/`CardHeader`/`CardContent` structure and all i18n strings (`success_title`, `success_email_note`, `success_check_spam`).

## Section C — Registered page → Telegram `Button`

In `app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`, replace the raw `<a className="inline-flex … border …">Get on Telegram</a>` with:
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
Keep the `botUsername && token` guard and the page layout.

## Section D — Register page edge states → `EmptyState`

In `app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`:
- **Event not found** branch → `<main className="… flex items-center justify-center …"><div className="w-full max-w-md"><EmptyState illustration={NoEvents} title={t("eventNotFound")} /></div></main>`.
- **Registration closed** branch → `<EmptyState illustration={NoEvents} title={event.name} message={event.venue ? \`${event.venue} · ${t("registrationClosed")}\` : t("registrationClosed")} />` inside the same centered wrapper.
- Keep the page's data fetch (`loadEvent`), `getTranslations`, and the open-registration branch (renders `RegistrationForm`) unchanged. `EmptyState` and illustrations are plain (non-`"use client"`) components, valid inside this async server component.

## Section E — New illustration `Registered`

In `frontend/lib/illustrations/flow.tsx`, add an exported `Registered({ className })` thin-line SVG (a check inside a circle) following the existing `base()` helper: `viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth={1.4}`, rounded caps, `aria-hidden="true"`, no hardcoded fills — e.g. `<circle cx="12" cy="12" r="9" />` + `<path d="m8.5 12 2.5 2.5 4.5-5" />`. It is re-exported via the existing `lib/illustrations/index.tsx` barrel.

## Testing

- **`__tests__/lib/illustrations.test.tsx`** — add `"Registered"` to the `NAMES` list (the existing `it.each` then asserts it renders an svg with `stroke="currentColor"`, `aria-hidden`, className passthrough, no hex fill).
- **`__tests__/components/guests/registration-form.test.tsx`** — keep all existing tests (they pass after migration: label/control association via `htmlFor`/`id` is preserved, `combobox`/`textbox` roles unchanged, `noValidate` kept, required-validation error counts unchanged, the form-level `role="alert"` kept). **Add** one test: given a required field and a non-required field, the non-required field's label shows "Optional" and the required field's does not.
- **`__tests__/components/guests/registration-success.test.tsx`** (create) — mock `next-intl` `useTranslations`; assert the success card renders an `<svg>` (the confirmation illustration) plus the title text.
- **Async server pages** (`register/page.tsx`, `registered/[guestId]/page.tsx`) — no bespoke unit test (awkward to render async server components in vitest); correctness is covered by `tsc --noEmit` + the `EmptyState`/`Button` unit tests. Flagged intentionally.
- Full suite green; `tsc --noEmit` clean; `pnpm lint` (0 errors; the banner `<img>` warning in `registration-form.tsx` remains, pre-existing/accepted) + `pnpm format:check` clean.

## Non-goals

- No backend/API changes; `useRegisterPublic`, field data model, validation rules, and routing unchanged.
- No `next/image` conversion of the banner.
- No changes to other public pages (info, claim) or auth pages — later phase.

## Delivery

Single PR (public register adoption), subagent-driven execution, merged to `main` as `vineidev`. Conventional single-line commits, no `Co-Authored-By` trailer; plan in `docs/plans/`.
