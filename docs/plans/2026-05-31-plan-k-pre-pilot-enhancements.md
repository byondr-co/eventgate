# Plan K — Pre-pilot Enhancement Wave (design)

> **Status:** brainstorm-validated 2026-05-31. Awaiting writing-plans pass to convert into bite-sized implementation tasks.
>
> **Pilot context:** pilot opens 2026-06-19 → 2026-07-17 for The Click Cam. T-7 is 2026-06-12 (12 days from today). Plan K must ship before T-7 to be useful for pilot.
>
> **Why this plan exists:** Plan J shipped the byondr umbrella rename + prod env split. Operator usage during Plan J smoke surfaced 11 small-to-medium quality gaps. Plan K addresses all 11 in two PRs — backend feature additions + frontend wiring/polish.

## 1. Goal

Ship 10 active enhancements (and document 1 already-correct item) that improve operator quality-of-life on the dashboard before pilot: member management, org rename, public-URL sharing, error display clarity, session-length pain, preset-field flexibility, CSV import UX, and org-context way-finding.

## 2. Decisions captured from the 2026-05-31 brainstorm

| # | Item | Decision |
|---|---|---|
| 1 | Org-create placeholder | `"byondr.co"` (org-level) ; event placeholder also updated to `` `byondr.co Conference ${currentYear}` `` (dynamic year) |
| 2 | Members page lacks org awareness | **New org-context layout** at `app/(app)/orgs/[slug]/layout.tsx` — breadcrumb + `OrgTabsNav` (Events / Members). Also resolves Plan J §9 deferred follow-up |
| 3 | Org rename | **Inline-editable display name** only; slug remains immutable; PATCH `/api/v1/orgs/<slug>/` with `{"name": "..."}` |
| 4 | Invite-member error UX | Parse `detail` from error response → inline destructive text via new `extractApiError(err)` helper |
| 5 | Member CRUD | PATCH role + DELETE membership + cancel-invite endpoints; sole-owner protection server-side |
| 6 | Public URL versions + copy | **New `ShortUrl` model + table** with 8-char base58 codes; auto-created on event create; both full URL + short URL shown with copy buttons |
| 7 | Add-form-field error UX | Same parser as #4 — generic mutation-error display |
| 8 | Session 15min → 1d | **Both layers**: bump `ACCESS_TOKEN_LIFETIME` to 1 day + implement frontend silent refresh (proactive timer + 401-retry fallback) |
| 9 | Preset field deletable | **Free delete** at backend (remove `is_preset` enforcement); UI shows confirm dialog with destructive warning when deleting `email`/`name`/`phone` |
| 10 | CSV import modal | Wider modal (`max-w-3xl` → `max-w-5xl`) + new `<DropZone>` component (drag-and-drop + click-to-browse) |
| 11 | CSV bulk email | **Already correctly designed.** `process_csv_import_task` → per-row `register_guest()` → per-guest `send_qr_email_task.delay()` with `max_retries=3, default_retry_delay=60`. No code changes; doc-only |

## 3. Out of scope (explicit non-goals)

- **Audit log of role changes / membership removals** — deferred post-pilot.
- **Slug rename for orgs** — only `name` editable; slug stays immutable.
- **Custom domain support for short URLs** — short URLs only served from `eventgate.byondr.co/r/<code>` and `eventgate-staging.byondr.co/r/<code>`.
- **Per-product reusable `<DropZone>` extraction** — built generic enough to extract later; not factored out in this plan.
- **Refresh-token rotation policy changes** — `SimpleJWT` `ROTATE_REFRESH_TOKENS=True` already in place; not touched.
- **Soft-delete of memberships or registration fields** — hard delete only.
- **Internationalization of new error messages** — English only; matches current state.

## 4. Architecture

### 4.1 New backend models

**`ShortUrl`** (new file: `backend/apps/shorturls/models.py`):

```python
class ShortUrl(models.Model):
    """A short-code redirect target (typically for public registration URLs)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    short_code = models.CharField(max_length=12, unique=True, db_index=True)
    target_url = models.CharField(max_length=500)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="short_urls",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=tz.now)
    expires_at = models.DateTimeField(null=True, blank=True)
```

New app: `backend/apps/shorturls/` (models, views, urls, services, admin, tests). Added to `INSTALLED_APPS`.

### 4.2 New / modified backend endpoints

| Route | Method | View | Permissions |
|---|---|---|---|
| `/api/v1/orgs/<slug>/` | PATCH | extend `OrganizationViewSet` with `UpdateModelMixin` | owner / admin |
| `/api/v1/orgs/<slug>/memberships/<id>/` | PATCH | new `OrgMembershipDetailView` | owner / admin |
| `/api/v1/orgs/<slug>/memberships/<id>/` | DELETE | same view | owner / admin |
| `/api/v1/orgs/<slug>/invites/<id>/` | DELETE | new `OrgInviteDetailView` | owner / admin |
| `/api/v1/orgs/<slug>/events/<event_slug>/fields/<key>/` | DELETE | existing `RegistrationFieldViewSet.perform_destroy` — **remove `is_preset` block** | owner / admin / manager |
| `/r/<short_code>/` | GET | new `ShortUrlRedirectView` | **public** (no auth) |

### 4.3 Behavior changes

- **Session config** (`backend/config/settings/base.py`): `ACCESS_TOKEN_LIFETIME` from `timedelta(minutes=15)` → `timedelta(days=1)`. `REFRESH_TOKEN_LIFETIME` unchanged at 14 days. `ROTATE_REFRESH_TOKENS=True` unchanged.
- **Magic-link email lifetime** unchanged (still 15 minutes; one-time-use); email body wording in `apps/accounts/tasks.py:26` stays.
- **Preset field deletion** (`apps/events/views.py` `RegistrationFieldViewSet.perform_destroy`): remove the `if instance.is_preset:` check entirely. Free delete.
- **Sole-owner protection** for membership operations: in `OrgMembershipDetailView`, when PATCH `role` would demote or DELETE would remove the sole-remaining owner, return 400 with `{"detail": "Cannot remove the sole owner of this organization."}`.

### 4.4 New / modified frontend components

| Path | Purpose |
|---|---|
| `frontend/lib/api.ts` (extend) | Add `extractApiError(err): string` helper |
| `frontend/lib/orgs.ts` (extend) | Add `useUpdateOrg(slug)`, `useUpdateMembership(slug, membershipId)`, `useRemoveMembership(slug, membershipId)`, `useCancelInvite(slug, inviteId)`, `usePendingInvites(slug)` hooks |
| `frontend/lib/short-urls.ts` (new) | Add `useEventShortUrl(eventId)` query hook |
| `frontend/lib/auth-refresh.ts` (new) | Silent-refresh module: proactive timer + reactive 401-retry wrapper around `apiFetch` |
| `frontend/app/(app)/orgs/[slug]/layout.tsx` (new) | Org-context segment layout; wraps `members/` + `events/` but NOT `events/[eventSlug]/...` (which has its own layout from Plan J) |
| `frontend/components/nav/org-tabs-nav.tsx` (new) | 2-tab nav (Events / Members) for org-context routes |
| `frontend/components/orgs/org-name-editor.tsx` (new) | Click-to-edit inline name component with pencil-icon affordance |
| `frontend/components/orgs/members-table.tsx` (modify) | Role dropdown per row + Remove button + pending invites section with Cancel button. Migrate error display to `extractApiError`. |
| `frontend/components/orgs/create-org-form.tsx` (modify) | Placeholder text → `"byondr.co"`. Migrate error display to `extractApiError`. |
| `frontend/components/events/event-create-wizard.tsx` (modify) | Placeholder text → `` `byondr.co Conference ${new Date().getFullYear()}` `` |
| `frontend/components/events/registration-form-builder.tsx` (modify) | Add preset-delete confirm dialog (destructive warning). Migrate error display to `extractApiError`. |
| `frontend/components/events/public-url-card.tsx` (new) | Replaces the current `<p>{publicUrl}</p>` block on event detail page; shows two URL rows with copy buttons |
| `frontend/components/events/copy-button.tsx` (new) | Reusable `<CopyButton text={...} />`; `navigator.clipboard.writeText` + toast.success |
| `frontend/components/events/csv-drop-zone.tsx` (new) | Dotted-bordered drag-and-drop zone; click-to-browse via hidden `<input type="file">` |
| `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` (modify) | Modal width `max-w-3xl` → `max-w-5xl`. Replace bare file input with `<DropZone>`. |
| `frontend/app/(app)/orgs/[slug]/page.tsx` (modify) | Use `<OrgNameEditor>` in place of the static `<h1>{org.name}</h1>` |
| `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (modify) | Replace public registration link block with `<PublicUrlCard event={event} />` |
| `frontend/app/(app)/layout.tsx` (modify) | Mount `<SessionRefreshProvider>` to wire silent-refresh |

### 4.5 Auto-creation of short URLs on event create

When an `Event` is created, a `ShortUrl` is created in the same transaction targeting the event's public registration URL. Implemented via a `post_save` signal in `apps/shorturls/signals.py` (registered in `apps/shorturls/apps.py`). The target URL uses `settings.PUBLIC_BASE_URL` (already set per-env) — e.g., `https://eventgate.byondr.co/e/<org-slug>/<event-slug>/register`.

If `Event.slug` changes after creation, the existing ShortUrl entry continues to redirect to the OLD slug's URL. Since slug is immutable for events (no rename feature in scope), this is fine.

### 4.6 Silent refresh module

```ts
// frontend/lib/auth-refresh.ts
//   - On auth-success: schedule setTimeout to call POST /api/v1/auth/refresh/ at 23h mark
//   - Wrap apiFetch: on 401, try refresh once; on success, retry the original request; on failure, redirect to /login?next=<current path>
//   - On unmount of <SessionRefreshProvider>, clear timer
```

Both layers are defense-in-depth: the proactive timer keeps sessions alive during normal use; the reactive 401-retry handles the edge case where the timer is wrong (e.g., laptop sleep crossing the 24h boundary).

## 5. Testing

### 5.1 Backend tests

| File | Cases |
|---|---|
| `backend/tests/test_orgs_update.py` (new) | PATCH name succeeds (owner); PATCH slug field is ignored / rejected; non-owner gets 403; empty/whitespace name returns 400 |
| `backend/tests/test_memberships.py` (extend) | PATCH role succeeds; DELETE membership succeeds; PATCH role to demote sole owner returns 400; DELETE on sole owner returns 400; non-admin gets 403 |
| `backend/tests/test_invites.py` (extend or new) | DELETE pending invite returns 204; DELETE accepted invite returns 400; non-admin gets 403 |
| `backend/tests/test_registration_fields.py` (extend) | DELETE preset field `email` succeeds; DELETE preset `name` succeeds; DELETE preset `phone_or_chat` succeeds (these previously returned 400) |
| `backend/tests/test_short_urls.py` (new) | `GET /r/<code>/` returns 302 to target_url; unknown code returns 404; expired short_url returns 404; event-create auto-creates ShortUrl with unique short_code; collision retry succeeds when first random code already exists |
| `backend/tests/test_auth_session.py` (new or extend) | `ACCESS_TOKEN_LIFETIME` resolves to 1 day; `POST /api/v1/auth/refresh/` returns a new access token; refreshed token has the configured lifetime |

### 5.2 Frontend tests (vitest)

| File | Cases |
|---|---|
| `frontend/__tests__/lib/api.test.ts` (new) | `extractApiError` parses `400 Bad Request: {"detail":"..."}` correctly; falls back on non-JSON; handles `non_field_errors` array; returns "Something went wrong." on non-Error inputs |
| `frontend/__tests__/lib/auth-refresh.test.ts` (new) | Proactive timer fires at the right interval; 401 triggers single refresh attempt; refresh failure redirects to /login; second 401 in a row doesn't loop |
| `frontend/__tests__/components/orgs/org-name-editor.test.tsx` (new) | Renders read-mode by default; pencil click swaps to input; Enter saves; Esc cancels (no mutation called); blur saves; mutation error renders inline |
| `frontend/__tests__/components/orgs/members-table.test.tsx` (extend) | Role dropdown change calls `useUpdateMembership.mutate`; remove button → confirm → calls `useRemoveMembership.mutate`; pending invites table renders with cancel buttons; cancel button calls `useCancelInvite.mutate`; sole-owner error message renders inline |
| `frontend/__tests__/components/nav/org-tabs-nav.test.tsx` (new) | Renders 2 tabs (Events / Members) with correct hrefs; active state per pathname (parameterized) |
| `frontend/__tests__/components/events/csv-drop-zone.test.tsx` (new) | Renders drop zone with hint text; click triggers hidden input; drop event with CSV file fires `onFile`; drop with non-CSV shows rejection message |
| `frontend/__tests__/components/events/copy-button.test.tsx` (new) | Click calls `navigator.clipboard.writeText` with provided text; on success calls `toast.success` |
| `frontend/__tests__/components/events/public-url-card.test.tsx` (new) | Renders both URL rows; copy buttons present; short URL loading state graceful |

### 5.3 No e2e tests

Wave-scoped vitest + pytest coverage is sufficient. End-to-end smoke against staging is part of the pilot-prep T-7 / T-3 dry-runs already scheduled in the runbook.

### 5.4 Gates

Same 8 as Plans H/I/J: backend pytest + mypy `apps config` + ruff check + ruff format; frontend lint + prettier + tsc + vitest.

## 6. Risk + reversibility

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `ACCESS_TOKEN_LIFETIME` bump causes hung sessions on cookie-decode mismatch | Low | Low (logout + re-login fixes) | Silent refresh module catches this; staging smoke before merge |
| Silent-refresh module mishandles concurrent 401s (request stampede) | Med | Low | Per-tab refresh-in-flight semaphore; tests cover the "two 401s same time" case |
| `ShortUrl` short_code collision in production | Very low | Low | Base58 8-char = 1.28 × 10^14 space; collision retry loop with bounded attempts |
| Preset field deletion leaks past UI warning, attendee can't supply email | Med (operator error) | Med (per-event scope) | Warning toast is destructive-styled + confirms; backend allows for explicit operator intent. Plan documents this trade-off |
| Sole-owner edge case: org-with-1-member where that member is owner gets removed | Med (user might try) | High (org orphaned) | Server-side enforcement in `OrgMembershipDetailView` returns 400 with clear message; tests cover this |
| New `org-context layout` breaks existing routes' rendering | Low | Med | Layout only adds wrapper; children render unchanged. Tests verify each member-table + events-table state |
| New `CopyButton` falls back when `navigator.clipboard` unavailable (HTTP / insecure context) | Low | Low | Production is HTTPS; staging is HTTPS; localhost is HTTPS-via-Vercel-dev. Fallback: text-selectable URL still rendered |
| Plan K-1 backend deploys without Plan K-2 frontend → frontend forms call new endpoints not in old code? | Reverse — old frontend doesn't call new endpoints, no conflict | None | Backend-first deploy is safe |

**Reversibility:** every change is `git revert` per commit. ShortUrl migration is reversible. Session lifetime config is a one-line revert.

## 7. Acceptance criteria

Plan K is "done" when ALL green:

- [ ] Org-create form placeholder shows `"byondr.co"`; event-create wizard shows `"byondr.co Conference {currentYear}"` with current year computed at render time
- [ ] Org dashboard renders org name as click-to-edit; pencil icon visible; Enter saves; mutation error renders inline parsed
- [ ] Members page (and Events list page) renders under new org-context layout: breadcrumb visible, 2-tab nav visible, active tab matches current route
- [ ] Members table shows role dropdown + Remove button per row; pending-invite section with Cancel buttons
- [ ] Sole-owner cannot demote or remove themselves: backend returns 400 with readable message; UI displays inline
- [ ] Event detail page shows `PublicUrlCard` with two URL rows + copy buttons; copy fires toast.success
- [ ] CSV import dialog: `max-w-5xl` width, drag-and-drop zone, click-to-browse fallback
- [ ] Deleting any preset field (email/name/phone) succeeds; UI shows destructive-styled confirm before sending DELETE
- [ ] Operator session does not log out for 24h of inactivity; silent refresh extends session transparently on long-running tabs
- [ ] All mutation error displays use `extractApiError`; no raw `400 : {"detail":...}` strings visible in the UI
- [ ] CI green on all 8 gates for PR #1 + PR #2
- [ ] Improvement log entry confirms #11 (CSV bulk email task model) verified as already correct

## 8. Rollout

- **Branch names:** `feature/plan-k-pre-pilot-enhancements` for the spec commit (this doc + impl plan). Execution PRs branch from main:
  - PR #1: `feature/plan-k-backend` — endpoints, model, migration, helper, session config
  - PR #2: `feature/plan-k-frontend` — wiring, UX polish, components
- **PR target:** `byondr-co/eventgate` `main`
- **Commit style:** single-line conventional-commit subjects (`feat(plan-k): ...`, `fix(plan-k): ...`, `chore(plan-k): ...`). NO `Co-Authored-By:` trailer.
- **Wave dependencies:** PR #1 lands first (backend endpoints exist). PR #2 branches from updated `main` and consumes those endpoints.
- **Estimated effort:** PR #1 ~1 dispatch (backend rename agent shape — well-bounded). PR #2 ~1 dispatch (frontend wiring is more files but each is small). Total: 2 single-shot agent dispatches over 1–2 days.
- **Pilot-prep alignment:** Both PRs should be merged by **2026-06-12 (T-7)** to be available during the T-3 dry-run smoke. Plenty of slack — pilot is 19 days out.

## 9. Follow-ups (deferred from this plan)

- **Audit log of role changes / membership removals** — separate plan.
- **Slug rename for orgs** — separate plan.
- **Custom domain support for short URLs** — per-customer vanity domain mapping.
- **Reusable `<DropZone>` extraction** for other upload surfaces (event logo, manual receipt upload, etc.).
- **Sole-owner UX hardening** — instead of just rejecting demote/remove, surface a "transfer ownership" flow.
- **Refresh-token revocation on logout** — currently logout clears cookie locally but doesn't invalidate the refresh token server-side.
- **Short URL analytics** — track click count per short_code; useful for organizers who want sharing data.
- **`ALLOWED_HOSTS` narrowing** — still pending from Plan J wrap-up. Independent of Plan K.
