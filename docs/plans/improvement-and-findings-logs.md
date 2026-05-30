## Purpose of this document
This document is to keep track of the improvement and findings of the project. This document is also to keep track of the features that are not working, not implemented, and the features that are working but need improvement. This document is also to keep track of the bugs and issues that are found during the development and testing phase. This document is also to keep track of the feedback and suggestions from the users and stakeholders.

Important note: Everything in this docuument should not be autonomously implemented without the approval of the project manager and the team lead.

## What is not working
- Invite member is not works
- **Device creation: 500 + raw HTML on unique (Label, Role) violation** (surfaced during Plan H T9 smoke, 2026-05-25). The `unique_together` (or unique constraint) check on device Label + Role bubbles up as a `django.db.utils.IntegrityError` → unhandled 500 → Django's debug HTML page (or empty 500 in prod-mode), instead of being caught by the serializer's `validate()` and re-raised as a `ValidationError` so the form renders a proper field-level message. Affects: dashboard → org → event → devices → "Add device" form. **Pre-existing bug — not Plan H related.** Deferred for separate hygiene fix. Likely fix: in the device-create serializer/view, wrap the save in a try/except `IntegrityError` and translate to a `ValidationError({"label": "A device with this label and role already exists."})` — or add an explicit serializer-level uniqueness validator that runs before save.
- **Event list: status badge shows fixed label "draft" regardless of actual event status** (surfaced during Plan H T9 smoke, 2026-05-25). The event-list table renders every row's status badge as the literal string `"draft"` instead of reading the row's `status` field (which per brief §5 schema can be `'draft' | 'open' | 'live' | 'closed' | 'archived'`). UI bug — the badge component isn't bound to the data. Affects: dashboard → org → events list view. **Pre-existing bug — not Plan H related.** Deferred for separate hygiene fix.
- **UI lacks proper navigation** (surfaced during Plan H T9 smoke, 2026-05-25). No breadcrumbs, no consistent back button, no clear hierarchy indicators when an operator drills into org → event → devices/scanner/walkin/audit/etc. Operators rely on the browser back button or URL surgery to navigate up. **Pre-existing UX issue — not Plan H related.** Worth a dedicated nav-pattern pass — recommend shadcn Breadcrumb + a persistent sidebar/tab nav for the event-context routes. (Note: the older "No navigation button back / forward" line under §What is not implemented partially overlaps; this finding refines it to "structural navigation, not just buttons.")

## What is not implemented
- No navigation button back / forward
- No update / edit feature for everything
- No delete feature for everything
- No search feature for everything
- No filter feature for everything
- No sorting feature for everything
- No pagination feature for everything
- No export feature for everything
- No import feature for everything
- No notification feature for everything
- No user role management feature for everything
- No permission management feature for everything
- No activity log feature for everything

## Operational findings / gotchas

- **2026-05-25 — Fly SSH does not inherit the Docker ENV.** Backend Dockerfile sets `ENV PATH=/app/.venv/bin:${PATH}` so the container's `release_command` (run by Fly with the Docker ENV applied) can use bare `python manage.py X`. But `flyctl ssh console` (interactive and `--command` mode) starts a fresh bash shell that does NOT inherit that Docker ENV — bare `python` resolves to the system Python (no Django), and `uv` is not in PATH at all (uv was only used at Docker build time). **Inside any `flyctl ssh ...` invocation, use `/app/.venv/bin/python manage.py …` explicitly.** Discovered during Plan H T4 webhook setup. Runbook §1.3 + Plan H execution plan updated.

- **2026-05-25 — `mypy apps/` (local pre-commit) vs `mypy apps config` (CI) scope mismatch.** Local pre-commit hooks ran mypy only against `apps/`; CI runs it against `apps config`. T5's rename touched `backend/config/settings/test.py` and introduced a type bug (`MEDIA_ROOT = tempfile.mkdtemp(...)` → `str`, but `base.py` types it as `Path` via `BASE_DIR / "media"`). The narrower-local / wider-CI gap let it pass T5's local gates and only fail at GHA. Fix landed in hotfix branch `hotfix/mypy-test-media-root` (PR #2). **Follow-up:** normalize the two mypy scopes to match. **Resolved 2026-05-25 by H3** — local pre-commit now runs `uv run mypy apps config` matching CI scope.

- **2026-05-25 — `DEFAULT_FROM_EMAIL` Fly secret was stale on staging after Plan H rename.** Source code base.py default was updated to `"Gatethres <noreply@gatethres.com>"` in T5, but the runtime value is sourced from the Fly secret `DEFAULT_FROM_EMAIL` which had been set to `"Eventgate <onboarding@resend.dev>"` during initial setup and was never rotated. T9 smoke caught it — outgoing email "from" still showed Eventgate. **Fixed 2026-05-25:** `flyctl secrets set --app eventgate-backend-staging DEFAULT_FROM_EMAIL="Gatethres <onboarding@resend.dev>"`. Sender domain stays `onboarding@resend.dev` (Resend default — no domain verification needed); switch to `noreply@mail.gatethres.com` when the deferred prod env split lands.

## Plan H — wrap-up summary (2026-05-25)

**Goal:** Rename brand from working-name "Eventgate" → **Gatethres** (pronounced GATE-thress · Khmer: ហ្គេតថ្រេស) and ship on staging infrastructure under the new brand. First-pilot customer The Click Cam, event window 2026-06-05 → 2026-07-03.

**What landed:**
- T0 + T1 — TM clean (USPTO + EUIPO + IPOS, 0 hits); `gatethres.com` registered; GitHub org `gatethres` created.
- T4 — New `@gatethres_bot` (Telegram doesn't allow bot username rename, so we created a fresh bot); webhook registered + verified; Vercel env var updated + redeployed.
- T5 — Internal repo rename across 23 active files (cookie names, SW cache key bumped v1→v2, PWA manifest, layout brand strings, Celery app name, package metadata, test assertions). All test gates green: pytest 257, mypy 137 (later 147 via PR #2), vitest 29, tsc, lint, prettier.
- T6 — README + brief §14 row 1 + runbook §intro + §1.4 updated; included a polish for stale `eventgate_access` cookie refs in runbook lines 192 + 296.
- T7 — GitHub repo renamed (`eventgate` → `gatethres`); local git remote updated; per scope amendment, deploy workflow `--app` flag stays at `eventgate-backend-staging`.
- T8 — Vatana confirmed Khmer transliteration **ហ្គេតថ្រេស** — applied to README + brief + runbook + Plan H spec.
- T9 — Regression smoke against staging (post-deploy): login, email sender, cookie name, PWA install, Telegram bot all live as Gatethres after PR #1 merge + Vercel auto-deploy + Fly secret rotation for `DEFAULT_FROM_EMAIL`.

**What was deferred (separate plan):**
- T2 + T3 — Prod env split (new Fly app + Vercel project + Neon prod branch + Upstash + Sentry + Resend + Tigris + DNS for `gatethres.com` / `api.gatethres.com`). Pilot runs on existing staging infra under the Gatethres brand. Track for successor plan.

**Bugs discovered during T9 smoke** — see "What is not working" above.

**Operational lessons logged in this doc** — Fly-SSH-doesn't-inherit-Docker-ENV; mypy local-vs-CI scope mismatch; `DEFAULT_FROM_EMAIL` Fly-secret needed manual rotation alongside source-code default.

**PRs:**
- [PR #1](https://github.com/vineidev/gatethres/pull/1) — Plan H bundle (waves T4–T8, 18 commits, merged 2026-05-24)
- [PR #2](https://github.com/vineidev/gatethres/pull/2) — Plan H hotfix (mypy MEDIA_ROOT type fix + T9 findings log entries, merged 2026-05-24)

**Plan H status: ✅ DONE (rename half). Prod env split tracked separately for follow-up.**

---

## Plan J — wrap-up summary (2026-05-30)

**Goal:** Rename `gatethres` → `eventgate`, migrate to `eventgate.byondr.co` (prod) + `api.eventgate.byondr.co` (backend) + staging mirror at `eventgate-staging.byondr.co`. Fold in Plan I prod env split (new Fly app `eventgate-backend-prod` in Singapore, fresh Neon prod project + database `eventgate`, Upstash prod `eventgate-redis-prod`, Sentry project `eventgate-prod`, Tigris bucket `eventgate-backend-prod-media`, verified Resend domain `mail.byondr.co` shared across future byondr products).

**Pilot window (revised):** 2026-06-19 → 2026-07-17 (slipped +2 weeks from original 2026-06-05; Click Cam confirmed).

**What landed:**
- Wave 3 code rename: cookie, SW cache v2→v3, Celery app name, pyproject, manifest, all brand strings (PR #11)
- Wave 3.5 naming corrections: `eventgate-backend-prod` + `byondr-co/eventgate` (PR #12)
- GitHub repo transfer to `byondr-co/eventgate` (made PUBLIC for Vercel integration)
- 4 GoDaddy DNS records for byondr.co subdomains (eventgate, api.eventgate, eventgate-staging, api.eventgate-staging)
- New Fly app `eventgate-backend-prod` (Singapore) with 26 secrets (21 manual + 5 Tigris auto-injected) + 3 process-group machines (app + worker + beat)
- Staging Fly secrets diff (ALLOWED_HOSTS + CSRF + FROM_EMAIL + MAGIC_LINK_FRONTEND_URL + PUBLIC_BASE_URL)
- Fly certs for both api.eventgate.byondr.co + api.eventgate-staging.byondr.co
- New Vercel project `eventgate-prod` linked to `byondr-co/eventgate`; staging Vercel renamed `frontend-five-lovat-94` → `eventgate-staging`
- Resend domain `mail.byondr.co` verified (Tokyo region)
- Telegram bot `@eventgate_bot` reused with rotated token + repointed webhook to `api.eventgate.byondr.co`
- Khmer transliteration: `អ៊ីវ៉ិនហ្គេត` (user-provided 2026-05-29, no Vatana round-trip)

**Operational lessons confirmed and surfaced:**

1. **`ALLOWED_HOSTS` must include a wildcard or the exact Fly Consul Host pattern** — narrower patterns (`api.example.com`, `.fly.dev`, `localhost`, `fly-local-6pn`) don't match Fly's internal health probe. Pragmatic fix: `ALLOWED_HOSTS="*"`. Narrow this post-pilot when we identify the exact Host header Fly Consul sends.

2. **`flyctl deploy` on a fresh multi-process app may only create the `app` machine** — `worker` and `beat` were missing on the first deploy. Run `flyctl scale count app=1 worker=1 beat=1 --app <app> --region sin --yes` after first deploy to ensure all process groups have machines. Without this, Celery tasks queue in Redis with no consumer.

3. **Vercel new-project Root Directory defaults to repo root** — even if the project name matches a sub-directory like `frontend/`. Set Root Directory explicitly in Settings → General after creating any new Vercel project in a monorepo, or the build will succeed silently with empty output.

4. **Staging-secrets-diff during prod env split must update ALL env-dependent values, not just hostnames** — Wave 6.4 of Plan J's impl plan only covered `ALLOWED_HOSTS` + `CSRF_TRUSTED_ORIGINS`, missing `MAGIC_LINK_FRONTEND_URL`, `PUBLIC_BASE_URL`, `RESEND_FROM_EMAIL`, `DEFAULT_FROM_EMAIL`. Each of these had to be patched manually during Wave 8.

5. **flyctl SSH is intermittently flaky** — repeated `flyctl ssh console --command "..."` invocations stall or get force-closed. Don't rely on SSH for critical verification in agent workflows. Prefer HTTP API (curl) or Telegram API endpoints (`getWebhookInfo`).

6. **Long-running agent dispatches can hang silently** — the original Wave 6 dispatched agent ran for ~24h before being killed. Cause likely the flyctl SSH stalls inside its loop. Future agents should add explicit per-command timeouts and report-and-continue on stalls.

7. **`flyctl secrets set` can fail with "failed to acquire lease"** if multiple `flyctl` operations run concurrently or in quick succession. Wait for the lease to expire (~1 min) or retry with a backoff loop.

**Resolved follow-ups from PR #5:**
- (none from Plan J side; staging mypy gap already closed in PR #5)

**Plan J status:** ✅ DONE.

**PRs:**
- [PR #11](https://github.com/byondr-co/eventgate/pull/11) — Wave 3 internal code rename (~24h delay, redirects from old vineidev/gatethres URL still work)
- [PR #12](https://github.com/byondr-co/eventgate/pull/12) — Wave 3.5 naming corrections (eventgate-backend-prod, byondr-co)
- (Wave 9 closeout PR — being opened by this agent)

## Plan K — verification finding (#11 CSV bulk email task model)

**2026-05-31 — Confirmed: CSV import already dispatches one Celery task per email send, with retry.**

Chain verified:
- `backend/apps/guests/views.py:281` — `process_csv_import_task.delay(import_id=str(ci.id))` enqueues one parent task per CSV upload
- `backend/apps/guests/tasks.py:84` `process_csv_import_task` — loops rows, calls `register_guest(...)` for each
- `backend/apps/guests/services.py:65` — `send_qr_email_task.delay(guest_id=str(guest.id))` enqueues one child task per guest
- `backend/apps/guests/tasks.py:26` — `@shared_task(name="guests.send_qr_email", bind=True, max_retries=3, default_retry_delay=60)` declaration

Implication: at pilot scale (a few hundred guests), bulk import will fan out into hundreds of independent Celery tasks. Upstash Redis + Celery worker concurrency=4 (per `fly.prod.toml`) handle this comfortably; each task is bounded I/O against Resend. No design change required.

**No code change in Plan K for this item.** Documentation-only verification.

## Plan K — wrap-up summary (2026-05-31)

**Goal:** Ship 11 pre-pilot enhancements (10 active + 1 doc-only) in 8 small PR slices: error display, session length, org rename, member CRUD, public-URL with short codes, CSV import drop-zone, preset-field deletion, org-context layout, plus the doc verification that CSV bulk email was already correctly designed.

**Pilot window:** 2026-06-19 → 2026-07-17 (unchanged from Plan J). Plan K shipped 19 days ahead of pilot opening — comfortable.

**What landed (8 PRs, all merged on `byondr-co/eventgate` main):**

| # | PR | Title | Items | Merge SHA |
|---|---|---|---|---|
| K1 | [#15](https://github.com/byondr-co/eventgate/pull/15) | plumbing & quick wins | #1, #4, #7, #8a, #11 | `8d2fbf6` |
| K2 | [#16](https://github.com/byondr-co/eventgate/pull/16) | org-context layout | #2 | `9eed2da` |
| K3 | [#17](https://github.com/byondr-co/eventgate/pull/17) | inline-editable org name + PATCH endpoint | #3 | `8849003` |
| K4 | [#18](https://github.com/byondr-co/eventgate/pull/18) | member CRUD — role / soft-remove / cancel invite | #5 | `b9bb9f2` |
| K5 | [#19](https://github.com/byondr-co/eventgate/pull/19) | short URL + copy buttons | #6 | `1216bc0` |
| K6 | [#20](https://github.com/byondr-co/eventgate/pull/20) | CSV import drop-zone + wider modal | #10 | `cc6b503` |
| K7 | [#21](https://github.com/byondr-co/eventgate/pull/21) | preset registration fields are now deletable | #9 | `fc5577f` |
| K8 | [#22](https://github.com/byondr-co/eventgate/pull/22) | silent refresh of access token | #8b | `76223bb` |

**Test counts (cumulative):**
- backend pytest: 283 (pre-Plan-K) → **309** (+26)
- frontend vitest: 73 (pre-Plan-K) → **99** (+26)
- All 8 CI gates green on every PR

**Operational lessons surfaced during Plan K execution:**

1. **No `make_user` / `make_org` test fixtures exist** in `conftest.py`. Tests must use direct ORM (`User.objects.create_user`, `Organization.objects.create_with_unique_slug`, `OrganizationMembership.objects.create`). The K3 PR (`tests/test_orgs_update.py`) and K5 PR (`tests/test_short_urls.py`) have small `_make_user` / `_make_org` helpers near the top — copy this pattern. Future plans referencing those fixtures by name need to adapt before dispatch.

2. **`isolation: "worktree"` silently failed once during K4.** The agent ran in the main checkout (`/Users/vinei/Projects/eventgate`) instead of a worktree. Damage was contained because the agent still created a feature branch (not committing directly to main). After merging K4, the dispatcher had to manually `git checkout main && git pull` to restore the local main checkout. K5+ dispatches added an explicit `pwd` check at the start of the agent prompt; this prevented re-occurrence in K5, K6, K7, K8. Recommendation: bake the `pwd` check into all future agent dispatch prompts.

3. **Frontend `tsconfig.target = "es2017"`** doesn't support the `s` (dotAll) regex flag. K1's `extractApiError` regex was caught locally by tsc; the working form is `[\s\S]+` instead of `.+` with `/s`.

4. **`vi.mock("@/lib/api")` must export ALL consumed exports from the mocked module.** When K1 added `extractApiError`, an existing test (`event-status-card.test.tsx`) failed because its mock didn't expose the new export. Fix: add `extractApiError: vi.fn()` (or a stub implementation) inside `vi.mock` calls when the test transitively imports the changed module.

5. **Pre-commit hooks (ruff-format, prettier) may auto-modify files mid-commit.** When this happens during agent execution, the agent must re-stage and re-commit as a NEW commit (`--amend` is forbidden by project conventions). Every K2–K8 agent handled this correctly.

6. **The codebase's existing soft-delete pattern (`is_active=False` on `OrganizationMembership`) is preferable to hard delete.** K4's `remove_membership` service sets `is_active=False`, matching the rest of the codebase. The Plan K spec said "hard delete only" but the agent correctly identified the existing pattern and used soft-delete. Updated spec convention going forward.

7. **For Django Event tests that need preset fields, call `seed_preset_fields(event)` explicitly.** The seeding is done in `EventViewSet.perform_create` (not in a model signal), so direct `Event.objects.create(...)` skips it. K7's tests added this discovery.

8. **The `signal` and `apps.ready()` pattern** for Django app auto-setup (K5's `ShortUrl` post_save signal): the signal must be imported inside `AppConfig.ready()` for it to register. K5 followed the standard pattern; ShortUrl rows auto-create on each new Event correctly.

**Cumulative deviations from Plan K impl plan (all approved during execution):**

- K1: regex form switched from `/...$/s` → `[\s\S]+` (ES2017 target)
- K1: added `extractApiError: vi.fn()` to `event-status-card.test.tsx` mock to keep existing test green
- K3: added a 5th `test_slug_in_read_only_fields` introspection check beyond the 4 spec-required tests
- K4: agent ran in main checkout (silent-worktree-fail); damage contained
- K5: added a 6th `test_generate_short_code_uses_base58_alphabet` beyond the 5 spec-required tests
- K6: removed "· CSV files only" from drop-zone hint to disambiguate from the error message in the rejection test
- K8: used `React.createElement(React.Fragment, null, children)` instead of JSX in `auth-refresh.ts` (file is `.ts` not `.tsx`)

**Open follow-ups (still deferred post-pilot):**

- Narrow `ALLOWED_HOSTS` from `"*"` (Plan J operational debt — still pending)
- Audit log of role changes / membership removals (Plan K §9)
- Refresh-token revocation on logout (Plan K §9)
- Short URL analytics (click count per code)
- Custom domain support for short URLs (per-customer vanity)
- Slug rename for orgs (Plan K spec out-of-scope; revisit if customers request)
- Reusable `<DropZone>` extraction for other upload surfaces
- Sole-owner UX: surface a "transfer ownership" flow instead of just rejecting

**Plan K status:** ✅ DONE. All 8 PRs merged. Test counts +26 each side. Pilot-prep is unblocked; T-7 dry-run on 2026-06-12 will exercise the new flows.
