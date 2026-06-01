# Plan L Hotfixes (Pilot Test Round 1) — Kickoff Handoff

> **For a fresh Claude in a new chat session.** Everything needed to fix the 10 issues found during prod pilot testing of Plan L — root causes already diagnosed, decisions locked, slice plan ready. Do **not** re-investigate; verify-then-fix.

## What just happened (one-line)

Plan L shipped end-to-end (8 PRs L1–L8, merged to `byondr-co/eventgate` `main`; live on staging + prod). The user then tested on prod and reported **10 findings** (bugs + UX polish). Root causes were traced and 3 design decisions locked in the planning session. This doc hands off implementation.

## Current state of the world

| Surface | Where | Status |
|---|---|---|
| Repo | https://github.com/byondr-co/eventgate (PUBLIC) | `main` has all of Plan L + docs |
| Prod frontend | `https://eventgate.byondr.co` | Vercel, auto-deploys on main push |
| Prod backend | `https://api.eventgate.byondr.co` | Fly `eventgate-backend-prod` — now running Plan L (health `ok`, migrations applied). Auto-deploys on push to main **scoped to `backend/**`** |
| Staging | `*-staging.byondr.co` | Auto-deploys; running Plan L |
| Prod secrets | — | `FLY_API_TOKEN_PROD` set; Tigris (`BUCKET_NAME`, `AWS_*`) set → `media_public` storage active; `PUBLIC_BASE_URL` + `MAGIC_LINK_FRONTEND_URL` set (= frontend origin) |
| Pilot window | 2026-06-19 → 2026-07-17 | Plan L hotfixes should land well before |
| Today | 2026-06-01 | — |

## The 10 findings — root causes (CONFIRMED) + fixes

1. **Banner upload UI should be drag-drop** like the CSV import. A drag-drop component already exists: `frontend/components/events/csv-drop-zone.tsx` (`CsvDropZone`, used by the CSV import dialog). Fix: generalize it into a shared `<FileDropZone>` (image variant) and use it in the banner editor.

2. **Banner upload broken — `415 Unsupported media type "multipart/form-data"`.** Root cause: `backend/config/settings/base.py:104` sets `DEFAULT_PARSER_CLASSES` to **`JSONParser` only**. The event PATCH (`EventViewSet`, `backend/apps/events/views.py` ~line 24) never accepted multipart — Plan L7 wrongly assumed DRF's default multipart parser was active. Fix: a **dedicated multipart upload endpoint** that sets `parser_classes = [MultiPartParser, FormParser]` (mirror `CsvImportPreviewView` in `backend/apps/guests/views.py`, which already does this). The frontend `useUploadBanner` (`frontend/lib/events.ts`) currently PATCHes the event detail with FormData — repoint it to the new endpoint.

2b. **Also `502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`.** Vercel→Fly proxy error. Prod has `min_machines_running = 1` (NOT scale-to-zero; `backend/fly.prod.toml`), so most likely a transient during the 6-deploy storm while shipping Plan L. Vercel's proxy also has a **~4.5 MB request-body limit** — a large PNG through the `/api` rewrite would 502. Mitigation: client-side **~4MB cap** + clear message on the banner upload. Re-test after S2 lands; only escalate to Fly/Vercel networking if it recurs.

3. **Create short link shows raw HTML error, but the row IS created (visible after reload).** Same intermittent 502 as #2b — the POST reached the backend, but the error response was an HTML page and `extractApiError` surfaced the raw HTML. Fixed by hardening `extractApiError` (#10) so it never shows raw HTML/JSON.

4. **Short link redirects to sign-in instead of the form.** Root cause: `frontend/next.config.ts` rewrites only **`/api/*`** to the backend (lines ~16–23) — **`/r/*` is NOT proxied**. So `eventgate.byondr.co/r/<code>` hits the Next app (no such route) instead of Django's redirect view at `api.eventgate.byondr.co/r/<code>/`. There is **no `frontend/middleware.ts`** (no global auth gate); the public register page `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` is genuinely public. Fix: add a `/r/:path*` rewrite → `${API_BASE}/r/:path*` in `next.config.ts`. (`PUBLIC_BASE_URL` = frontend origin, so the stored `target_url` already points at the public register page.)

5. **Deleted preset field (`phone_or_chat`) still shows on the register page.** `frontend/components/guests/registration-form.tsx` **hardcodes** the name/email/phone blocks (PRESET_KEYS set at line 12; hardcoded inputs ~lines 82–110) and only filters PRESET_KEYS out of the *custom* list. The public detail endpoint (`PublicEventDetailView` in `backend/apps/events/views.py`) already returns ALL current fields (presets included) in `fields`. **Decision: full data-driven rewrite** — render the entire form from `event.fields` (sorted by `order_index`), client-side required validation per field.

6. **CSV import modal still small / breaks UI.** `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` sets `DialogContent className="max-w-5xl"` but it's likely capped by the Dialog's default width and/or lacks overflow/scroll. Inspect `frontend/components/ui/dialog.tsx` (Base UI) `DialogContent` default classes; fix width + add `max-h`/`overflow-auto` and horizontal scroll for the preview table.

7. **Sole owner can still remove / change own role; enforce ≥1 owner.** L5 already blocks self-*role*-change (`OrgMembershipDetailView.partial_update` in `backend/apps/orgs/views.py`) and `services.py` blocks demoting/removing the sole owner. Gaps: no self-*removal* guard in `destroy`, and the UI shows Remove on your own row. Fix: add a self-remove guard in `destroy` (mirror the self-role guard) + hide Remove on own row in `frontend/components/orgs/members-table.tsx` (it already has `useMe()` + own-row logic from L5).

8. **Email QR / Copy Telegram link should toast.** `frontend/components/guests/guests-table.tsx` uses inline `setNotice` text. Switch to toasts (sonner is set up — see below).

9. **Unify toast UI (success/error/warning/info).** `frontend/components/ui/sonner.tsx` exists with themed icons; `<Toaster/>` is mounted in `frontend/app/layout.tsx:40`; `toast` from `"sonner"` is already used in `copy-button.tsx` + `event-status-card.tsx`. Add a thin `frontend/lib/toast.ts` helper (success/error/warning/info) and use it everywhere for action feedback.

10. **Unify action/error messages — no raw HTML/JSON.** `extractApiError` (`frontend/lib/api.ts`) falls back to the raw `Error.message` on non-JSON bodies (HTML 5xx pages). Harden it to always return a clean message; add a field-error parser for DRF `{field: [...]}` / `{detail} / {non_field_errors}`. **Decision on placement:** action notifications → **toast**; **form** errors → **inline** (under the field for field-specific, at the **top of the form** for generic), never raw.

## Decisions locked (do not re-litigate)

1. **Toasts vs inline:** action notifications (success/error/warning/info) → toast. Form-submission/validation errors → inline (field-bottom or form-top) with the *extracted* clean message.
2. **Banner upload:** dedicated backend multipart endpoint + drag-drop dropzone + ~4MB client-side cap (dodges Vercel's body limit).
3. **Register form:** full data-driven rewrite from `event.fields` (not conditional patching).

## Proposed slice plan (subagent waves — file-disjoint for safe parallelism)

**Wave 1 — foundation (1 slice):**
- **S1**: `frontend/lib/toast.ts` (success/error/warning/info over sonner) + harden `extractApiError` (clean message, never raw HTML/JSON) + a field-error parser. Touches `frontend/lib/api.ts` + new `frontend/lib/toast.ts`.

**Wave 2 — parallel, each branches from main-with-S1 (6 slices, disjoint files):**
- **S2** Banner: dedicated `MultiPartParser` upload endpoint (`backend/apps/events/views.py`, `urls.py`, tests) + generalized `frontend/components/common/file-drop-zone.tsx` + rewire `frontend/lib/events.ts useUploadBanner` + `frontend/components/events/event-presentation-editor.tsx` (4MB cap, toast). *(#1, #2)*
- **S3** Short links: add `/r/:path*` rewrite in `frontend/next.config.ts`. *(#4)*
- **S4** Registration form: data-driven render + inline field/form-top errors in `frontend/components/guests/registration-form.tsx`. *(#5, #3-for-that-form)*
- **S5** Owner enforcement: self-remove guard in `backend/apps/orgs/views.py` `OrgMembershipDetailView.destroy` (+ test in `backend/tests/test_memberships.py`) + hide Remove on own row in `frontend/components/orgs/members-table.tsx`. *(#7)*
- **S6** CSV modal: width/overflow/responsive in `csv-import-dialog.tsx` (+ maybe `frontend/components/ui/dialog.tsx`). *(#6)*
- **S7** Action toasts: convert `frontend/components/guests/guests-table.tsx` (Email QR / Copy TG) + `frontend/components/shorturls/links-table.tsx` (create/copy) feedback to toasts. *(#8, #3-symptom)*

Dependency: S2–S7 import `lib/toast.ts` + the hardened `extractApiError`, so **S1 must merge before Wave 2**. Within Wave 2 the slices touch disjoint files → safe to run in parallel.

## Execution workflow (this user's confirmed pattern)

- Each slice → `Agent` tool with `isolation: "worktree"`, `subagent_type: "general-purpose"`, **full task body inlined** (don't make the subagent read a plan file), **RELATIVE paths only**.
- First step of every agent prompt: `pwd` check — must contain `.claude/worktrees/`; if not, STOP (worktree isolation can silently fail).
- Per slice: implementer → spec-compliance review (subagent, read-only on the worktree path) → code-quality review (subagent) → fix loop if needed → merge.
- Each slice opens a PR to `byondr-co/eventgate` `main`; **rebase-merge** (`gh pr merge <n> --repo byondr-co/eventgate --rebase --delete-branch`).
- Auth before `gh pr create`/merge: `gh auth switch --hostname github.com --user vineidev`.
- Dispatch the next wave only after the current wave's merges land on `main`.

## Gotchas banked from Plan L execution (READ — these will bite)

1. **DRF `DEFAULT_PARSER_CLASSES` is JSON-only** — any multipart endpoint must set `parser_classes` explicitly (this is the cause of #2).
2. **`next.config.ts` only rewrites `/api/*`** — anything else served by the backend (e.g. `/r/*`) needs its own rewrite (cause of #4).
3. **This repo uses Base UI (`@base-ui-components/react`), NOT Radix.** Dialog uses a `render` prop, not `asChild`. See `frontend/components/common/confirm-dialog.tsx` for the working pattern.
4. **Branch protection does NOT require the `test` check** — `gh pr merge` will merge even while CI is pending. **Manually verify CI is green** (`gh pr checks <n>`) before merging.
5. **The `test` workflow is path-filtered** (backend/frontend). Workflow- or docs-only PRs have no `test` checks; that's expected.
6. **Backend test helpers:** no `make_user`/`make_org` fixtures. Define local helpers:
   ```python
   def _make_user(email): return User.objects.create_user(email=email)
   def _make_org(name, owner, role="owner"):
       org = Organization.objects.create_with_unique_slug(name=name)
       OrganizationMembership.objects.create(user=owner, organization=org, role=role)
       return org
   ```
   (`Organization` has no `owner=` kwarg; create the membership separately.)
7. **`tsconfig.target = es2017`** — no `s` (dotAll) regex flag; use `[\s\S]+`.
8. **`vi.mock("@/lib/api")` must export every consumed binding** (`apiFetch`, `extractApiError`, `API_BASE`).
9. **pnpm-in-worktree quirks:** the rolldown native `.node` binding can be missing in a fresh worktree (symlink it from the main store if `pnpm test` fails to load it); a stray `pnpm-workspace.yaml` can trip `prettier --check` (already in `frontend/.prettierignore`).
10. **Pre-commit hooks reformat** (ruff-format/prettier) — re-stage and commit a NEW commit, never `--amend`.
11. **Prod deploy** is path-filtered to `backend/**` now, so frontend/docs merges don't redeploy prod. A backend merge auto-deploys prod (needs `FLY_API_TOKEN_PROD`, already set) and runs migrations.
12. **PUBLIC repo:** customer name (The Click Cam) + collaborator names already in history — acceptable per user.

## Key file pointers

| File | Why |
|---|---|
| `backend/config/settings/base.py:101` | `REST_FRAMEWORK` — JSON-only parsers (#2) |
| `backend/apps/guests/views.py` (`CsvImportPreviewView`) | working `MultiPartParser` pattern to copy (#2) |
| `backend/apps/events/views.py` | `EventViewSet` (add banner endpoint) + `PublicEventDetailView` (returns `fields`/`banner_image`/`description`) |
| `backend/apps/events/models.py` | `Event.banner_image` (storage=`public_media_storage`), `description` |
| `backend/apps/common/storage.py` | `public_media_storage()` selector |
| `backend/apps/orgs/views.py` | `OrgMembershipDetailView` (self-role guard from L5; add self-remove guard) |
| `frontend/next.config.ts:16` | rewrites (add `/r/*`) (#4) |
| `frontend/components/guests/registration-form.tsx` | hardcoded presets → data-driven (#5) |
| `frontend/components/guests/guests-table.tsx` | Email QR / Copy TG inline notice → toast (#8) |
| `frontend/components/shorturls/links-table.tsx` | create/copy feedback → toast (#3/#8) |
| `frontend/components/events/event-presentation-editor.tsx` | banner upload (rewire to new endpoint + dropzone + cap) |
| `frontend/lib/events.ts` | `useUploadBanner` (repoint), `Event`/`PublicEventDetail` types |
| `frontend/lib/api.ts` | `apiFetch` (FormData support exists), `extractApiError` (harden) |
| `frontend/components/ui/sonner.tsx`, `frontend/app/layout.tsx:40` | sonner Toaster (mounted) |
| `frontend/components/events/csv-drop-zone.tsx` | generalize → `<FileDropZone>` (#1) |
| `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` + `frontend/components/ui/dialog.tsx` | CSV modal width (#6) |
| `docs/plans/2026-05-31-plan-l-pilot-feedback-fixes.md` / `-implementation.md` | Plan L spec + impl (context) |
| `docs/plans/improvement-and-findings-logs.md` | cumulative lessons |

## What the new Claude should do first

1. Read this handoff. Spot-check the cited files/lines (memory may be stale).
2. **Skip re-diagnosing** — root causes above are confirmed against `main`.
3. (Optional) `superpowers:writing-plans` to expand the S1–S7 slices into a bite-sized plan doc at `docs/plans/2026-06-01-plan-l-hotfixes.md`, OR dispatch directly with inlined task bodies.
4. Execute with `superpowers:subagent-driven-development`: **Wave 1 = S1**, merge, then **Wave 2 = S2–S7** in parallel. Spec + quality review per slice; rebase-merge on green.
5. After S2/S7 land, **re-test banner upload + short-link create on prod** to confirm the 502 is gone; if it recurs, investigate Fly/Vercel networking (not just body size).
6. Confirm with the user before merging if any slice deviates from the locked decisions.

## How to start the new chat session

Use the prompt the user was given alongside this doc (it points here). This doc has everything else.
