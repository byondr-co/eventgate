# Handoff — 2026-05-25 (pilot-prep session, end-of-day)

> **Status:** 5 PRs shipped this session on top of [`handoff-2026-05-25.md`](handoff-2026-05-25.md) (which captured the post-Plan-H ship state earlier in the day). Pilot opens 2026-06-05 (11 days out). Customer: The Click Cam. Window: 2026-06-05 → 2026-07-03.

## What shipped in this session

All landed on `main` via separate PRs, rebase-merged so commit history is linear and per-task SHAs are preserved.

| PR | Title | Merge SHA range | Notes |
|---|---|---|---|
| [#5](https://github.com/vineidev/gatethres/pull/5) | hygiene: device-create 400, event status Badge, mypy CI parity | squashed at `121581e` | Pre-pilot hygiene wave: H1 device-create 500 → 400, H2 event-list status Badge, H3 backend-mypy pre-commit hook |
| [#6](https://github.com/vineidev/gatethres/pull/6) | feat(events): status transition action + state-machine UI | `7d4a8d9..6cb8cec` | Event-status transition feature — backend `@action` + frontend `useTransitionEvent` + `EventStatusCard` |
| [#7](https://github.com/vineidev/gatethres/pull/7) | feat(nav): event-context breadcrumb + tab nav layout with badges | `5717bea..23747b0` | Structural nav: shadcn Breadcrumb, contextual 7-tab nav on event sub-routes, live count badges for Help desk + Guests, palette refinement |
| [#8](https://github.com/vineidev/gatethres/pull/8) | Plan I — prod env split scaffolding + runbook (no cloud changes) | `09fadf0..fde9af7` | Repo-side scaffolding for prod env split (deferred from Plan H). Dormant `fly.prod.toml` + `deploy-backend-prod.yml` workflow + user-action checklist in plan doc |
| [#9](https://github.com/vineidev/gatethres/pull/9) | Event-transition follow-ups: perm cleanup + skip-live + toast feedback | `4eaba04..b245403` | (a) move transition into `get_permissions()` role switch, (b) add `open → closed` transition edge, (c) shadcn Sonner toast util + migrate EventStatusCard feedback |

**Main tip at end of session:** `b245403`. **Commits since session start (9af23b3):** 17.

## What's deployed where

| Env | Backend | Frontend | Last shipped |
|---|---|---|---|
| Staging (= pilot env) | `eventgate-backend-staging` (Fly, `sin`) | `frontend-five-lovat-94.vercel.app` | PR #9 (backend) + Vercel auto-deploy (frontend) |
| Prod | not yet provisioned — see [Plan I](plans/2026-05-25-plan-i-prod-env-split.md) §6 user-action checklist | not yet provisioned | n/a |

Pilot runs on staging-as-prod per Plan H scope amendment (still in force). Plan I §7 is the cutover sequence when prod is ready.

## T-7 prep diagnostics — ran early on 2026-05-25 (4 days ahead of nominal T-7)

Per runbook §1.2 + §1.3. All passes:

- ✅ Local main = origin/main (no divergence)
- ✅ Backend tests + mypy + ruff + ruff-format: all green on latest main
- ✅ Frontend lint + prettier + tsc + vitest: all green (73 tests across 9 files post-PR #9)
- ✅ GHA `Deploy backend to Fly` last ran on PR #9 merge (`b245403`) and succeeded
- ✅ All Fly migrations applied on staging (`showmigrations` shows no `[ ]` rows)
- ✅ Append-only audit trigger present + actively blocks UPDATE (`IntegrityError audit_auditevent is append-only (TG_OP=UPDATE)`)
- ✅ All 3 Fly process groups running (app + beat + worker; standby beat machine on hot-spare)
- ✅ Telegram webhook configured at `https://eventgate-backend-staging.fly.dev/api/v1/telegram/webhook/`, `pending_update_count=0`, no error
- ✅ All 24 Fly secrets deployed (SENTRY_DSN, RESEND_API_KEY, DEFAULT_FROM_EMAIL, full TELEGRAM_* set, all AWS_* + BUCKET_NAME for Tigris, JWT_COOKIE_*, MAGIC_LINK_FRONTEND_URL)
- ✅ GHA `FLY_API_TOKEN` repo secret present (set 2026-05-21)

**Outstanding for T-3 / T-1** (need live-action, not flagged today):
- Resend deliverability — send a test registration to an allow-listed dev address; QR PNG should arrive within 30s
- Sentry test event landing — trigger a deliberate 500 and confirm it tags `environment=staging` within 60s

## Key files added / changed this session

- `frontend/components/nav/breadcrumb-trail.tsx` — derives breadcrumb from pathname + org/event data
- `frontend/components/nav/event-tabs-nav.tsx` — 7-tab nav with badge counts (Help desk + Guests)
- `frontend/components/events/event-status-card.tsx` — Badge + transition buttons + toast feedback
- `frontend/components/ui/breadcrumb.tsx` — shadcn primitive
- `frontend/components/ui/sonner.tsx` — shadcn primitive; `<Toaster />` mounted in `app/layout.tsx`
- `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx` — segment layout wrapping all event sub-routes
- `backend/apps/events/services.py` — `transition_event()` + `ALLOWED_EVENT_TRANSITIONS` (state machine)
- `backend/apps/events/views.py` — `@action(detail=True, methods=["post"], url_path="transition")` on `EventViewSet`
- `backend/fly.prod.toml` — dormant prod Fly config (`app = "gatethres-backend"`)
- `.github/workflows/deploy-backend-prod.yml` — manual-dispatch / release-triggered prod deploy

## Plan I — what's left (out of session)

See [`docs/plans/2026-05-25-plan-i-prod-env-split.md`](plans/2026-05-25-plan-i-prod-env-split.md) §6 for the full user-action checklist. High level:

1. **Cloud accounts** — create Neon prod branch, Upstash prod, Sentry prod project; verify Resend domain `mail.gatethres.com` (24–48h DNS propagation window)
2. **Fly app** — `flyctl apps create gatethres-backend && flyctl secrets set --stage ... && flyctl deploy --config fly.prod.toml`
3. **Cloudflare DNS** — apex → Vercel, `api` → Fly, Resend MX/SPF/DKIM (DNS-only, no proxy)
4. **Vercel prod project** — `gatethres-app` with custom domain `gatethres.com`
5. **Cutover sequence** — §7 of the plan doc. Hard cutover, not blue/green. Staging keeps running indefinitely.

**Recommendation:** start Resend domain verification first (longest async wait). Provisioning order is roughly: accounts → Fly app + secrets → DNS → Vercel domain → cutover.

## Other open follow-ups (deferred, documented)

- **Org-level breadcrumb / nav** — only if pilot operators report wanting it. Currently no breadcrumb on org-level routes (just 2: Events, Members).
- **Mobile hamburger Sheet drawer for nav** — only if door-day operators report tab-scroll friction on phones.
- **Khmer translations of `nav.*` keys** — queued behind Vatana's full copy review (runbook item).
- **Audit tab badge ("entries today")** — judged noisy; only if operators report missing it.
- **`live → open` reversal edge** — not in scope; once live, no unwind. Add if operator workflow requires.
- **Toast migration for other mutations** — `<Toaster />` is now mounted globally; future call-sites (walk-in capacity, PIN rotation, device create/revoke) can migrate from inline destructive text to `toast.success/error()` over time.
- **Multi-region Neon read replica** — Plan I §13, only if pilot growth justifies.

## Cumulative operational gotchas (from improvement-and-findings-logs.md)

These are unchanged from earlier handoff but worth re-surfacing because pilot operators will hit them:

1. **Fly SSH does NOT inherit the Docker `ENV PATH`.** Use `/app/.venv/bin/python manage.py …` explicitly, not bare `python`.
2. **`flyctl secrets set` does NOT run `release_command`.** For env vars that need a Django management command, run it manually after `secrets set`.
3. **mypy local-vs-CI scope mismatch** — **resolved by H3** in PR #5; local pre-commit now runs `uv run mypy apps config` matching CI.
4. **Telegram BotFather doesn't allow bot username changes** — display name and other attributes only.
5. **Vercel `NEXT_PUBLIC_*` env vars inline at build time** (including in Server Components). Trigger a redeploy after any change.
6. **gh CLI active account can flip between authenticated accounts.** This repo is on `vineidev`; run `gh auth switch --hostname github.com --user vineidev` before any `gh` invocation.

## Pilot-prep cadence (calendar)

| Date | Distance | Activity | Status |
|---|---|---|---|
| 2026-05-25 | T-11 | Plan H ship + pilot-prep session | ✅ done (this handoff) |
| 2026-05-29 | T-7 | runbook §1.2 GHA gate check + §1.3 infra dry-run | ✅ **completed early on 2026-05-25** |
| 2026-06-02 | T-3 | Plan F verification + Plan G regression smoke + cross-device flows | pending |
| 2026-06-04 | T-1 | Full dry-run on Vatana's device + PWA install banner + Khmer copy spot-check | pending |
| 2026-06-05 | T-0 | Pilot opens | scheduled |
| 2026-07-03 | T+28 | Pilot window closes | scheduled |

## Recommended next session

1. **Resend Plan I §6.1** — start the Resend domain verification clock (it has the longest async wait at 24–48h). Other Plan I tasks can happen later.
2. **T-3 dry-run on 2026-06-02** — Plan F verification + Plan G regression smoke; check Resend deliverability + Sentry test event landing (the two outstanding items from today's T-7 prep).
3. **Whatever else is freshly on your mind** — small follow-ups, Vatana Khmer pass timing, marketing decisions, etc.

## Memory notes (auto-loaded for the user)

Unchanged from earlier handoff:
- Per-task worktree + parallel-wave execution workflow
- Eventgate repo conventions (plans location `docs/plans/`, no `Co-Authored-By` trailer)
- First pilot window 2026-06-05 → 2026-07-03
- Plan H brand pick = Gatethres (GATE-thress; ហ្គេតថ្រេស; fallback Slidegate)
