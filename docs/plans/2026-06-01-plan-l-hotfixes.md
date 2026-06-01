# Plan L Hotfixes (Pilot Test Round 1) — Bite-Sized Implementation Plan

> Expands the S1–S7 slices from `docs/handoff-2026-06-01-plan-l-hotfixes-kickoff.md` into
> per-slice task bodies for subagent-driven execution. Root causes were diagnosed and
> verified against `main` (1713d24) on 2026-06-01. **Verify-then-fix; do not re-investigate.**

## Base & locked decisions

- **Base branch:** `byondr-co/eventgate` `main` (1713d24 — all of Plan L merged).
- **D1 — Toasts vs inline:** action notifications (success/error/warning/info) → toast.
  Form-submission/validation errors → inline (under the field for field-specific, at the
  top of the form for generic), using the *extracted* clean message. Never raw HTML/JSON.
- **D2 — Banner upload:** dedicated backend multipart endpoint + drag-drop dropzone +
  ~4MB client-side cap (dodges Vercel's ~4.5MB proxy body limit).
- **D3 — Register form:** full data-driven rewrite from `event.fields` (not conditional patching).

## Waves

- **Wave 1 = S1** (foundation). Must merge before Wave 2 — S2–S7 import `lib/toast.ts`
  + the hardened `extractApiError`.
- **Wave 2 = S2–S7** in parallel, each branched from `main`-with-S1. Files are disjoint.

## Gotchas (will bite — confirmed against main)

1. DRF `DEFAULT_PARSER_CLASSES` is JSON-only (`backend/config/settings/base.py:104`). Any
   multipart endpoint must set `parser_classes` explicitly. `CsvImportPreviewView`
   (`backend/apps/guests/views.py:197`, `parser_classes = [MultiPartParser]` at :207) is the pattern.
2. `frontend/next.config.ts` only rewrites `/api/*` (lines ~16–21). `/r/*` needs its own rewrite.
3. Repo uses **Base UI (`@base-ui-components/react`), NOT Radix.** Dialog uses a `render` prop,
   not `asChild`. See `frontend/components/common/confirm-dialog.tsx`.
4. **Branch protection does NOT gate on `test`** — `gh pr merge` merges even with CI pending.
   Manually verify `gh pr checks <n>` is green before merging.
5. `test` workflow is path-filtered (backend/frontend). Docs/workflow-only PRs have no `test` check.
6. Backend test helpers: no `make_user`/`make_org` fixtures. Define local `_make_user`/`_make_org`
   (Organization has no `owner=` kwarg; create the membership separately).
7. `tsconfig.target = es2017` — no `s` (dotAll) regex flag; use `[\s\S]+`.
8. `vi.mock("@/lib/api")` must export every consumed binding (`apiFetch`, `extractApiError`, `API_BASE`).
9. pnpm-in-worktree: rolldown native `.node` binding may be missing in a fresh worktree
   (symlink from main store if `pnpm test` fails to load it); stray `pnpm-workspace.yaml`
   already in `frontend/.prettierignore`.
10. Pre-commit hooks reformat (ruff-format/prettier) — re-stage and commit a NEW commit, never `--amend`.
11. Prod deploy is path-filtered to `backend/**`. Backend merges auto-deploy prod + run migrations.

---

## S1 — toast helper + hardened extractApiError + field-error parser (Wave 1)

**Goal:** Single source of truth for user-facing action feedback (toasts) and clean error
extraction. Everything in Wave 2 depends on these.

**Files:**
- NEW `frontend/lib/toast.ts`
- EDIT `frontend/lib/api.ts` (`extractApiError`)
- NEW tests: `frontend/__tests__/lib/toast.test.ts` (or `.tsx`), `frontend/__tests__/lib/api-error.test.ts`

**Changes:**
1. `frontend/lib/toast.ts`: thin wrapper over `sonner`'s `toast`. Export `notify` object (or
   named fns) with `success(msg)`, `error(msg)`, `warning(msg)`, `info(msg)`. `error` should
   accept `unknown` and run it through `extractApiError` so callers can pass a caught error
   directly. The `<Toaster/>` is already mounted (`frontend/app/layout.tsx:40`) and
   `frontend/components/ui/sonner.tsx` provides themed icons — do not re-mount.
2. Harden `extractApiError` (`frontend/lib/api.ts:43`): currently it regex-matches
   `^\d+\s+[^:]*:\s*([\s\S]+)$` and falls back to the raw `err.message` for non-JSON bodies
   (HTML 5xx pages leak through). Change so it **never returns raw HTML/JSON**: if the
   captured body (or whole message) looks like HTML (`<` / `<!doctype` / `<html`) or fails to
   parse as the known DRF error shapes, return a clean generic message
   (e.g. "Something went wrong. Please try again."). Keep parsing `{detail}` (string) and
   `{non_field_errors: [...]}`.
3. Add a **field-error parser** export, e.g. `extractFieldErrors(err): { fieldErrors: Record<string,string>, formError: string | null }`
   for DRF `{field: ["msg", ...]}` / `{detail}` / `{non_field_errors}` payloads. `fieldErrors`
   maps field key → first message; `formError` carries `detail`/`non_field_errors`/generic.
   This is consumed by S4's inline form errors.

**Acceptance:**
- `extractApiError` returns a clean string for: a `{detail}` body, a `{non_field_errors}` body,
  an HTML 500 page (no raw tags), and a plain network error.
- `extractFieldErrors` splits `{email: ["Enter a valid email."]}` into `fieldErrors.email`
  and leaves `formError` null; folds `{detail}`/`{non_field_errors}` into `formError`.
- `toast.ts` exports compile and the four levels call the corresponding `sonner` variants.
- `pnpm test` + `pnpm lint` + `pnpm tsc --noEmit` green. Use `[\s\S]` not `/s`.

---

## S2 — banner multipart upload endpoint + dropzone + 4MB cap (Wave 2)

**Goal:** Fix `415 Unsupported media type` on banner upload (EventViewSet PATCH is JSON-only)
via a dedicated multipart endpoint; drag-drop UI; ~4MB client cap to dodge Vercel's proxy limit.

**Files:**
- EDIT `backend/apps/events/views.py` (new upload view/action with `parser_classes = [MultiPartParser, FormParser]`)
- EDIT `backend/apps/events/urls.py` (route for the new endpoint)
- EDIT `backend/tests/test_event_banner.py` (multipart upload test)
- NEW `frontend/components/common/file-drop-zone.tsx` (generalized from `csv-drop-zone.tsx`)
- EDIT `frontend/lib/events.ts` (`useUploadBanner` → point at new endpoint)
- EDIT `frontend/components/events/event-presentation-editor.tsx` (use dropzone, 4MB cap, toast on success/error)

**Changes:**
1. Backend: add an endpoint that accepts `multipart/form-data` with a `banner_image` file and
   sets it on the event, mirroring `CsvImportPreviewView` (`backend/apps/guests/views.py:197`,
   `parser_classes` at :207). Reuse existing auth/permission pattern from `EventViewSet`.
   Suggested route: `POST /api/v1/orgs/<slug>/events/<eventSlug>/banner/`. Return the updated
   event (same shape as the detail serializer, incl. `banner_image` URL). Keep
   `Event.banner_image` on `public_media_storage` (already wired).
2. Frontend: generalize `csv-drop-zone.tsx` (`CsvDropZone`, `onFile(file)`, drag + click input)
   into `file-drop-zone.tsx` with configurable `accept` and label/help text. Keep `CsvDropZone`
   working (either re-implement it on top of `FileDropZone` or leave it; do not break CSV import).
3. `useUploadBanner` (`frontend/lib/events.ts:139`): POST FormData to the new `/banner/` endpoint
   instead of PATCHing the event detail. Keep query invalidation (events + public-event).
4. `event-presentation-editor.tsx`: replace the bare `<input type=file>` (line ~62) with the
   image `FileDropZone`. Enforce a client-side **~4MB** size cap before upload; on oversize show
   an error toast ("Image must be under 4 MB"). On success → success toast; on failure →
   `toast.error(err)`.

**Acceptance:**
- Backend test: multipart POST with an image file succeeds (200/201) and sets `banner_image`;
  a non-multipart/JSON POST does not 500. `uv run pytest backend/tests/test_event_banner.py` green.
- Frontend: dropzone accepts image drop + click; >4MB rejected client-side with toast; successful
  upload shows preview + success toast. CSV import dialog still works.
- `pnpm test/lint/tsc` + backend `ruff`/`mypy`/`pytest` green.

---

## S3 — /r/:path* rewrite in next.config.ts (Wave 2)

**Goal:** Short links (`eventgate.byondr.co/r/<code>`) must reach Django's redirect view
(`api…/r/<code>/`) instead of hitting the Next app (→ sign-in / 404).

**Files:** EDIT `frontend/next.config.ts`

**Changes:** In `rewrites()` (next to the existing `/api/*` entries, ~line 16–21) add:
```ts
{ source: "/r/:path*", destination: `${API_BASE}/r/:path*` },
```
Match the trailing-slash handling Django expects (the redirect view lives at `/r/<code>/`).
Add both a slash and non-slash form if needed, mirroring the `/api` pair. Add/extend the
config test if one exists; otherwise no test (config-only, no `test` check will run — that's fine).

**Acceptance:**
- `frontend/next.config.ts` rewrites `/r/<code>` to `${API_BASE}/r/<code>`.
- `pnpm build` / `pnpm tsc --noEmit` green. (Will be verified end-to-end on prod after merge.)

---

## S4 — data-driven registration form + inline errors (Wave 2)

**Goal:** Deleted preset fields (e.g. `phone_or_chat`) still render because the form hardcodes
name/email/phone. Rewrite to render entirely from `event.fields`. Inline errors per D1.

**Files:** EDIT `frontend/components/guests/registration-form.tsx`
(+ update its test if present under `frontend/__tests__/`).

**Changes:**
1. Remove the hardcoded `PRESET_KEYS` set (line 12) and the hardcoded name/email/phone input
   blocks (~lines 82–110). Render **all** fields from the `fields` prop (`PublicEventField[]`),
   sorted by `order_index`. The public detail endpoint (`PublicEventDetailView`) already returns
   every current field (presets included) in `fields`.
2. Drive input type/label/required from each field's metadata. Client-side required validation
   per field on submit.
3. Errors (D1): field-specific validation/server errors render **inline under the field**;
   generic/form-level errors render at the **top of the form**. Use S1's `extractFieldErrors`
   for server `400` responses (map `fieldErrors` → under-field, `formError` → form-top).
   Never show raw HTML/JSON.

**Acceptance:**
- A field removed in the builder no longer renders on the public register page.
- Required fields block submit with inline messages; a server 400 surfaces field/form errors inline.
- `pnpm test/lint/tsc` green. (`[\s\S]` not `/s` if regex needed.)

---

## S5 — sole-owner self-remove guard + hide Remove on own row (Wave 2)

**Goal:** A user can still remove themselves (and the UI offers it). Enforce: you can't remove
your own membership via the API, and the Remove control is hidden on your own row.

**Files:**
- EDIT `backend/apps/orgs/views.py` (`OrgMembershipDetailView.destroy`, :197)
- EDIT `backend/tests/test_memberships.py`
- EDIT `frontend/components/orgs/members-table.tsx`

**Changes:**
1. Backend: in `destroy` add a self-removal guard mirroring `partial_update` (:184):
   ```python
   if membership.user_id == request.user.id:
       return Response(
           {"detail": "You cannot remove yourself. Ask another owner/admin."},
           status=status.HTTP_400_BAD_REQUEST,
       )
   ```
   Place it before `remove_membership`. (`remove_membership` already blocks sole-owner removal;
   this adds the self-removal guard.)
2. Test: own-row DELETE returns 400 and membership stays active; removing another member still works.
3. Frontend: `members-table.tsx` already has `useMe()` (line 28) and own-row logic from L5.
   Hide the Remove control when `m.user_id === me.data?.id` (same row identity check used for role).

**Acceptance:**
- `uv run pytest backend/tests/test_memberships.py` green incl. new self-remove-blocked test.
- Remove button absent on own row; present on others. `pnpm test/lint/tsc` + backend checks green.

---

## S6 — CSV import modal width/overflow/responsive (Wave 2)

**Goal:** CSV import preview modal is too small / overflows. Widen + add scroll.

**Files:**
- EDIT `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx`
- Inspect (edit only if needed) `frontend/components/ui/dialog.tsx`

**Changes:** `DialogContent` is `className="max-w-5xl"` (line 70) but is likely capped by the
Base UI Dialog default width and lacks vertical/horizontal scroll. Inspect `dialog.tsx`
`DialogContent` default classes; ensure the width actually applies (override default `max-w` if
the base clamps it), add `max-h-[…]` + `overflow-auto`, and make the preview table horizontally
scrollable (`overflow-x-auto` wrapper). Base UI, not Radix — Dialog uses a `render` prop.

**Acceptance:**
- Modal is visibly wider and the preview table scrolls instead of breaking layout (verify in browser).
- `pnpm test/lint/tsc` green.

---

## S7 — action toasts in guests-table + links-table (Wave 2)

**Goal:** Replace inline `setNotice` action feedback with toasts (D1).

**Files:**
- EDIT `frontend/components/guests/guests-table.tsx`
- EDIT `frontend/components/shorturls/links-table.tsx`
- Update their tests under `frontend/__tests__/` if present.

**Changes:**
1. `guests-table.tsx`: remove the `notice`/`setNotice` state (lines 14, 17–33, 50). On Email QR
   success → `toast.success("QR email queued.")`; on Copy Telegram success →
   `toast.success("Telegram link copied.")`; on error → `toast.error(e)` (runs through
   `extractApiError`).
2. `links-table.tsx`: route create/copy success + error feedback through toasts (the create
   error was surfacing raw HTML — #3; toasts + hardened extractor fix it).

**Acceptance:**
- Email QR / Copy Telegram / link create + copy show toasts; no inline notice text remains.
- `pnpm test/lint/tsc` green (mocks export every consumed `@/lib/api` binding).

---

## Post-merge verification

After **S2** and **S7/S3** land on `main` (prod auto-deploys on backend merge):
1. Re-test **banner upload** on `https://eventgate.byondr.co` — expect success, no 415, no 502.
2. Re-test **short-link create + redirect** — create a link, confirm the create response is clean
   (no raw HTML), reload to confirm the row, and follow `/r/<code>` to confirm it redirects to the
   public register page (not sign-in).
3. If the 502 recurs after the 4MB cap, escalate to Fly/Vercel networking (not just body size).
4. Final full-set code review; update `docs/plans/improvement-and-findings-logs.md` + write a
   closeout handoff.
