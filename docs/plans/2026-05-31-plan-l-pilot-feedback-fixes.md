# Plan L — Early-Pilot Feedback Fixes (design)

> **Status:** brainstorm-validated 2026-05-31. Awaiting writing-plans pass to convert into bite-sized implementation tasks.
>
> **Pilot context:** pilot opens 2026-06-19 → 2026-07-17 for The Click Cam. T-7 is 2026-06-12. Plan L should have all PRs merged by **2026-06-08** (T-11) so Plan M (Google integration) can start after.
>
> **Why this plan exists:** Plan K shipped end-to-end on 2026-05-31, after which an early pilot test on prod surfaced real client feedback: bugs + feature requests. Three of five reported "bugs" were stale-prod artifacts (resolved by redeploying prod backend to v7). The rest are addressed here. Google Form / Spreadsheet integration is deferred to **Plan M** — explicitly NOT in scope.

## 1. Goal

Fix the remaining real bugs from the early pilot test, wire prod auto-deploy, and ship four operator/guest-facing features (registration banner, per-event short-link management, per-guest QR resend actions, guest search) plus an ownership-transfer flow — all before the pilot window, sliced into small PRs.

## 2. Decisions captured from the 2026-05-31 brainstorm

| # | Item | Effort | Decision |
|---|------|--------|----------|
| L-bug-1 | Duplicate breadcrumb on event page | XS | Remove `<BreadcrumbTrail />` from the event layout; the parent org layout already renders it. Keep `<EventTabsNav />`. |
| L-bug-2 | `window.confirm` for deletes | S | Build one reusable `<ConfirmDialog>` (shadcn Dialog, destructive confirm button); replace all `window.confirm` sites; reuse for new confirm flows. |
| L-bug-3 | Member role-change / remove / invite don't refresh UI | XS | React-query cache-key mismatch. Align invalidation keys with query keys in `frontend/lib/orgs.ts`. Add regression test. **(new — from pilot feedback)** |
| L-ops-1 | Prod backend not auto-deployed | XS | Add `push: branches: [main]` trigger to `deploy-backend-prod.yml`. |
| L-ops-2 | Object storage for uploads | S | Configure Fly Tigris (S3-compatible) storage — `django-storages[s3]`/`boto3` already present, so config + bucket/secret provisioning only. Prerequisite for L-feat-2 banner uploads. **(new — infra)** |
| L-feat-2 | Registration banner + description | M–L | Direction A (cover banner). New `Event.banner_image` (upload to Tigris) + `Event.description` (single-language text). Public `/register` redesign. Default theme colors (no configurable accent for MVP). |
| L-feat-3 | Per-event short-link management | M | New "Links" tab. `ShortUrl` gains `visit_count` + `note` + `is_active`. `Guest` gains `referrer_short_url` (SET_NULL). Create (auto code) + edit note/expiry + disable (no hard delete). Registration-target only. |
| L-feat-4 | Per-guest QR resend actions | S | Two row actions: **Email QR** (enqueue existing `send_qr_email_task`, enabled only when row has email) + **Copy Telegram link** (new per-guest endpoint returns `t.me` deep link). |
| L-feat-5 | Guest search | S | Server-side `search` query param (icontains name/email/phone) + a search box above the guests table. No filter dropdowns. |
| L-feat-6 | Transfer ownership | S–M | Co-owner model. Block an owner from changing their **own** role inline; remove "owner" from the inline dropdown; promote to owner only via an explicit confirm-gated **"Make owner"** action. **(new — from pilot feedback)** |

## 3. Out of scope (explicit non-goals)

- **Google Form / Spreadsheet integration** — deferred to Plan M.
- **Generic short URLs** — short links target the event registration page only; arbitrary destinations are not supported in MVP.
- **`click_count` / click-through tracking** — only `visit_count` (a hit on `/r/<code>`). True click-through would need an interstitial; not worth it.
- **Hard delete of short links** — disable (`is_active=False`) only. `Guest.referrer_short_url` uses `SET_NULL` to allow future hard-delete.
- **Configurable accent/theme color on the registration page** — banner image + description only for MVP.
- **Bilingual registration description** — single text field; field labels remain bilingual as before.
- **Single-owner enforcement** — multiple owners stay allowed; "transfer" promotes a co-owner.
- **Audit log of role changes** — still deferred (Plan K §9 follow-up).
- **`ALLOWED_HOSTS` narrowing** — Plan J operational debt, untouched.

## 4. Architecture

### 4.1 Backend model changes

**`backend/apps/shorturls/models.py` — extend `ShortUrl`:**

```python
visit_count = models.PositiveIntegerField(default=0)
note = models.TextField(blank=True)
is_active = models.BooleanField(default=True)
# short_code, target_url, event, created_at, expires_at already exist
```

**`backend/apps/guests/models.py` — add to `Guest`:**

```python
referrer_short_url = models.ForeignKey(
    "shorturls.ShortUrl",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="referred_guests",
)
```

**`backend/apps/events/models.py` — add to `Event`:**

```python
banner_image = models.ImageField(upload_to="event-banners/", null=True, blank=True)
description = models.TextField(blank=True)
```

Migrations for `shorturls`, `guests`, `events`. `ImageField` requires **`Pillow`, which is not currently a backend dependency — add it** (in the L-feat-2 PR).

### 4.2 Backend endpoint changes

| Route | Method | View | Permissions | Item |
|-------|--------|------|-------------|------|
| `/r/<code>/` | GET | `redirect_short_url` (extend) | public | feat-3 |
| `/api/v1/orgs/<slug>/events/<eventSlug>/short-urls/` | POST | extend `EventShortUrlListView` (add create) | org member (owner/admin/manager) | feat-3 |
| `/api/v1/orgs/<slug>/events/<eventSlug>/short-urls/<id>/` | PATCH | new detail view (note, expires_at, is_active) | org member | feat-3 |
| `/api/v1/orgs/<slug>/events/<eventSlug>/guests/<id>/send-qr-email/` | POST | new view → `send_qr_email_task.delay` | org member | feat-4 |
| `/api/v1/orgs/<slug>/events/<eventSlug>/guests/<id>/telegram-link/` | GET | new view → `{ "url": "https://t.me/<bot>?start=<entry_token>" }` | org member | feat-4 |
| `/api/v1/orgs/<slug>/events/<eventSlug>/guests/` | GET | extend `GuestListView` with `search` param | org member | feat-5 |
| `/api/v1/orgs/<slug>/memberships/<id>/` | PATCH | extend guards in `update_membership_role` + view | owner/admin | feat-6 |

**feat-3 redirect flow:** `/r/<code>/` →
1. 404 if `is_active=False` or expired.
2. `ShortUrl.objects.filter(pk=...).update(visit_count=F("visit_count") + 1)`.
3. Redirect to `target_url` with `?ref=<code>` appended (target is the event register page).

Registration (`PublicRegistrationView` / `register_guest`) accepts an optional `ref` (query param or payload), resolves it to a `ShortUrl` scoped to the event, and sets `guest.referrer_short_url`. Unknown/foreign `ref` → silently ignored (registration still succeeds).

**feat-3 create:** auto-generates a unique short code (reuse the existing base58/code generator used at event creation). `target_url` is auto-set to the event's public register URL. Body accepts `note` + optional `expires_at`.

**feat-4 Telegram link:** the staff `GuestSerializer` deliberately omits `entry_token`; the new per-guest endpoint returns the fully-formed deep link so the token stays out of the bulk list response. Uses `settings.TELEGRAM_BOT_USERNAME`.

**feat-6 guards (in `apps/orgs/services.py` / `OrgMembershipDetailView`):**
- Reject a role change where `membership.user_id == request.user.id` (an owner cannot change their own role). Return 400 with a clear `detail`.
- A new "make owner" path sets `role="owner"` on a target membership (confirm-gated in UI). The existing sole-owner demotion guard stays.

### 4.3 Object storage (L-ops-2)

- `django-storages[s3]` + `boto3` are **already** dependencies, and `config/settings/prod.py` **already** defines a private `STORAGES["default"]` S3 (Tigris) backend gated on `BUCKET_NAME` (env vars: `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`). No package additions and no change to the private default.
- That default is `default_acl=private` + `querystring_auth=True` (signed, expiring URLs) — correct for staff-only CSV imports but **wrong for a public banner**. Add a second **`media_public`** storage alias (`public-read`, `querystring_auth=False`) + a `public_media_storage()` selector that `Event.banner_image` uses; falls back to local filesystem in dev/test.
- Provision the Tigris bucket + secrets for `eventgate-backend-prod` and `eventgate-backend-staging` via `flyctl storage create` (operator-run; documented in the pilot runbook).

### 4.4 Frontend changes

| Area | File(s) | Item |
|------|---------|------|
| Remove duplicate breadcrumb | `app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx` | bug-1 |
| Reusable confirm dialog | new `components/common/confirm-dialog.tsx` | bug-2 |
| Replace `window.confirm` | `components/orgs/members-table.tsx`, `components/events/registration-form-builder.tsx` | bug-2 |
| Fix query-key invalidation | `lib/orgs.ts` (`useUpdateMembership`, `useRemoveMembership`, `useSendInvite`) | bug-3 |
| Guests search box | `components/guests/guests-table.tsx`, `lib/guests.ts` | feat-5 |
| Guest row actions (Email QR, Copy Telegram link) | `components/guests/guests-table.tsx`, `lib/guests.ts` | feat-4 |
| Members: disable own-row role select + "Make owner" action | `components/orgs/members-table.tsx`, `lib/orgs.ts` | feat-6 |
| Links tab | new tab in `components/nav/event-tabs-nav.tsx` + new page under `app/(app)/orgs/[slug]/events/[eventSlug]/links/` + `lib/shorturls.ts` | feat-3 |
| Registration banner + description | public `app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` + `components/guests/registration-form.tsx`; editing UI in the event **Form** tab; `lib/events.ts` types | feat-2 |

### 4.5 ConfirmDialog reuse

`<ConfirmDialog>` (bug-2) is consumed by: member remove, preset-field delete, short-link disable (feat-3), and "Make owner" (feat-6). Build it first.

## 5. Testing notes

- **bug-3:** regression test asserting that after a role-update / remove mutation, the members query is invalidated (mock `queryClient.invalidateQueries` or assert refetch). Guard against future key drift.
- **feat-3:** backend tests for visit_count increment, disabled/expired → 404, `ref` attribution sets `referrer_short_url`, create auto-code uniqueness, PATCH note/expiry/is_active.
- **feat-4:** endpoint tests — send-qr-email enqueues for a guest with email, telegram-link returns correct deep link; permission checks (org member only).
- **feat-5:** list filtering by `search` across name/email/phone (icontains), pagination preserved.
- **feat-6:** owner cannot change own role (400); sole-owner demotion still blocked; "make owner" promotes a co-owner.
- **feat-2:** public event serializer exposes banner_image URL + description; storage falls back to local in test.

### Banked lessons to surface to every agent (from Plan J/K)

1. No `make_user`/`make_org` fixtures — use the `_make_user`/`_make_org` helper pattern (`backend/tests/test_orgs_update.py`, `test_short_urls.py`).
2. Frontend `tsconfig.target = es2017` — no `s` (dotAll) regex flag; use `[\s\S]+`.
3. `vi.mock("@/lib/api")` must export every consumed binding.
4. `isolation: "worktree"` can silently fail — first agent step is a `pwd` check.
5. Soft-delete pattern exists (`OrganizationMembership.is_active`, `Invite.revoked_at`); mirror it for `ShortUrl.is_active`.
6. Pre-commit hooks (ruff-format, prettier) may modify files — re-stage and commit as a NEW commit (no `--amend`).
7. `flyctl ssh console` is flaky — prefer HTTP/curl for verification.
8. PUBLIC repo — customer/collaborator names already in history; acceptable per user.
9. `frontend/AGENTS.md`: "this is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before TSX.

## 6. Proposed PR slicing (8 PRs, dependency-ordered)

| PR | Item(s) | Notes |
|----|---------|-------|
| L1 | bug-1 + bug-3 | Two tiny unrelated fixes, no shared files |
| L2 | bug-2 (`ConfirmDialog`) | Reusable; other PRs depend on it — ship early |
| L3 | ops-1 | Standalone YAML trigger |
| L4 | feat-5 (search) + feat-4 (row actions) | Both touch guests-table + guests API |
| L5 | feat-6 (transfer ownership) | Members-table + orgs API; depends on L2 |
| L6 | ops-2 (Tigris storage) | Infra prerequisite for L7 |
| L7 | feat-2 (banner + description) | Depends on L6 |
| L8 | feat-3 (Links tab) | Self-contained model + tab; depends on L2 |

Each PR slice dispatches one agent in an isolated worktree (single-shot pattern); auto-merge + auto-dispatch-next on CI green.

## 7. Target dates

- **Spec + impl plan committed:** 2026-05-31 / 06-01.
- **All PRs merged:** by 2026-06-08 (T-11).
- **Plan M (Google integration) starts:** after Plan L lands; target merged by 2026-06-12 (T-7).
