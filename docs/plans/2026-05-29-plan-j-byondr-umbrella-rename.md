# Plan J — byondr umbrella rename + prod env split (design)

> **Status:** brainstorm-validated 2026-05-29. Awaiting writing-plans pass to convert into bite-sized implementation tasks.
>
> **Pilot context (revised):** pilot window slipped to **2026-06-19 → 2026-07-17** (+2 weeks; The Click Cam confirmed). Original window 2026-06-05 → 2026-07-03 retired.
>
> **Why this plan exists:** the user reconsidered the Gatethres brand on 2026-05-27 (poor Asian/Khmer resonance) and on 2026-05-29 settled on a **byondr umbrella** strategy. All software the user builds will live under `byondr.co` (a domain already owned at GoDaddy) with each product on its own subdomain. The current Gatethres software becomes **Eventgate** at `eventgate.byondr.co`. Plan J also **folds in the deferred prod env split** (originally Plan I), since the rename and env split touch overlapping surfaces and doing them together is cleaner than two passes.

## 1. Goal

Rename the active codebase from Gatethres → Eventgate, migrate it from staging-only infrastructure under the Gatethres brand to a real prod environment at `eventgate.byondr.co`, and produce a renamed-staging mirror at `eventgate-staging.byondr.co` so pilot can run on prod with full byondr-branded URLs.

## 2. Out of scope

- **Other byondr products.** This plan covers Eventgate only. Future products get their own plans + their own subdomains under byondr.co.
- **byondr.co landing page / portfolio site.** The apex `byondr.co` keeps its current GoDaddy WebsiteBuilder placeholder. Marketing surfaces are post-pilot.
- **Brand identity for Eventgate (logo, color palette, type system).** Separate workstream.
- **TM filing for Eventgate.** Optional 5-min user-side check during Wave 0; byondr.co umbrella absorbs most of the TM risk since the legal-bearing brand is the company name, not the product name.
- **Migrating staging data to prod.** Prod starts empty (same rule as Plan I §3.4).
- **Renaming the local Dexie DB.** Internal name, no user impact.
- **Mass-rewriting historical plan documents.** They're the audit trail. Only active code/config + README + brief §14 row 1 + runbook §1.4 placeholders get updated.

## 3. Decisions captured from the 2026-05-29 brainstorm

| Decision | Value |
|---|---|
| Pilot window | 2026-06-19 → 2026-07-17 (+2 weeks; Click Cam confirmed) |
| Umbrella domain | `byondr.co` (registrar: GoDaddy; DNS at `ns75/76.domaincontrol.com`) |
| Product URL (prod) | `https://eventgate.byondr.co` |
| Backend URL (prod) | `https://api.eventgate.byondr.co` |
| Product URL (staging mirror) | `https://eventgate-staging.byondr.co` |
| Backend URL (staging mirror) | `https://api.eventgate-staging.byondr.co` |
| Email sender domain | `mail.byondr.co` (shared across all future byondr products; single Resend verification) |
| Email FROM display | `"Eventgate <noreply@mail.byondr.co>"` |
| GitHub home | new `byondr` org → `byondr/eventgate` |
| Telegram bot | reuse `@eventgate_bot` (preserved as Plan H Wave 4 safety net) |
| Fly app (prod) | `eventgate-backend` (Singapore region) |
| Fly app (staging) | `eventgate-backend-staging` (kept as-is; rename requires destroy+recreate, not worth it) |
| Vercel project (prod) | `eventgate` (under your Vercel scope; transferable to a future byondr team) |
| Vercel project (staging) | `frontend-five-lovat-94` (kept as-is) |
| Khmer transliteration | **`អ៊ីវ៉ិនហ្គេត`** (provided by user 2026-05-29 — Vatana round-trip not needed) |
| Resend domain status | **✅ already verified** by user on 2026-05-29 (DNS records pasted at GoDaddy) |
| Plan I scope | folded into Plan J — prod env splits as part of this rename |

## 4. Target state — full URL + resource map

### 4.1 URL mapping

| Surface | Gatethres (current) | Eventgate (post Plan J) |
|---|---|---|
| Frontend prod URL | n/a (staging-as-prod under Gatethres) | `https://eventgate.byondr.co` |
| Backend prod URL | n/a | `https://api.eventgate.byondr.co` |
| Frontend staging URL | `https://frontend-five-lovat-94.vercel.app` | `https://eventgate-staging.byondr.co` |
| Backend staging URL | `https://eventgate-backend-staging.fly.dev` | `https://api.eventgate-staging.byondr.co` |
| Email sender | `Gatethres <onboarding@resend.dev>` | `Eventgate <noreply@mail.byondr.co>` |

The `.vercel.app` and `.fly.dev` URLs continue to work as platform-provided origins — they don't go away; they're just no longer the canonical operator-facing URLs.

### 4.2 Code-surface rename map (active files only)

| Surface | Gatethres (now) | Eventgate (post Plan J) |
|---|---|---|
| GitHub repo | `vineidev/gatethres` | `byondr/eventgate` |
| Cookie name | `gatethres_access` | `eventgate_access` |
| SW cache keys | `gatethres-shell-v2`, `gatethres-next-static-v2` | `eventgate-shell-v3`, `eventgate-next-static-v3` (bump to v3 to force PWA invalidation) |
| Celery app name | `gatethres` | `eventgate` |
| PWA manifest `name` / `short_name` | `Gatethres` | `Eventgate` |
| README + brief + runbook §1.4 brand strings | `Gatethres` | `Eventgate` |
| Brand brief §14 row 1 | Plan H Gatethres pick | Plan J Eventgate rename + byondr umbrella |

### 4.3 New cloud resources (prod)

| Resource | New name | Region | Owner |
|---|---|---|---|
| Fly backend app | `eventgate-backend` | `sin` | Fly |
| Vercel project | `eventgate` | n/a | Vercel |
| Neon Postgres branch | new `prod` branch (fresh empty DB) | TBD (Neon region of staging) | Neon |
| Upstash Redis | new prod instance | Singapore | Upstash |
| Sentry project | `eventgate-prod` (new project distinct from existing `eventgate`) | personal-org | Sentry |
| Tigris bucket | `eventgate-backend-media` | n/a | Fly Tigris (via `flyctl storage create`) |
| Resend domain | `mail.byondr.co` | `us-east-1` | Resend — **already verified ✅** |

### 4.4 DNS records to add at GoDaddy

Resend records are already added by the user 2026-05-29 (`MX mail` + `TXT mail` SPF + `TXT resend._domainkey.mail` DKIM). The remaining 4 records are for the frontend + backend prod and staging mirrors:

| Type | Name | Value | Notes |
|---|---|---|---|
| `CNAME` | `eventgate` | `cname.vercel-dns.com.` | Prod frontend → Vercel; exact value from Vercel's Domains tab |
| `CNAME` | `api.eventgate` | `eventgate-backend.fly.dev.` | Prod backend → Fly; create AFTER `flyctl certs add api.eventgate.byondr.co` |
| `CNAME` | `eventgate-staging` | `cname.vercel-dns.com.` | Staging mirror frontend → existing Vercel project `frontend-five-lovat-94` |
| `CNAME` | `api.eventgate-staging` | `eventgate-backend-staging.fly.dev.` | Staging mirror backend → existing Fly staging app |

No proxy/CDN config — GoDaddy DNS doesn't proxy. SSL is issued by Vercel (apex/sub) and Fly (api subdomains) automatically once the CNAMEs resolve.

### 4.5 Fly secrets (prod app `eventgate-backend`)

```bash
flyctl secrets set --app eventgate-backend --stage \
  DATABASE_URL="<new Neon prod branch URL>" \
  REDIS_URL="<new Upstash prod URL>" \
  SENTRY_DSN="<new Sentry eventgate-prod DSN>" \
  SENTRY_ENVIRONMENT="prod" \
  RESEND_API_KEY="<reuse staging key — per-account>" \
  RESEND_FROM_EMAIL="noreply@mail.byondr.co" \
  DEFAULT_FROM_EMAIL="Eventgate <noreply@mail.byondr.co>" \
  SECRET_KEY="$(openssl rand -hex 64)" \
  ALLOWED_HOSTS="api.eventgate.byondr.co,eventgate-backend.fly.dev" \
  CSRF_TRUSTED_ORIGINS="https://eventgate.byondr.co,https://api.eventgate.byondr.co" \
  TELEGRAM_BOT_TOKEN="<reuse @eventgate_bot token from BotFather>" \
  TELEGRAM_BOT_USERNAME="eventgate_bot" \
  TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  TELEGRAM_WEBHOOK_URL="https://api.eventgate.byondr.co/api/v1/telegram/webhook/" \
  BUCKET_NAME="eventgate-backend-media" \
  AWS_ACCESS_KEY_ID="<from flyctl storage create>" \
  AWS_SECRET_ACCESS_KEY="<from flyctl storage create>" \
  AWS_ENDPOINT_URL_S3="<from flyctl storage create>" \
  AWS_REGION="auto"
```

Tigris creds + bucket name auto-inject if `flyctl storage create --app eventgate-backend` runs BEFORE the secrets-set batch.

### 4.6 Staging Fly secrets — additions

The existing `eventgate-backend-staging` Fly app needs its host config updated to accept the new staging mirror URLs:

```bash
flyctl secrets set --app eventgate-backend-staging --stage \
  ALLOWED_HOSTS="api.eventgate-staging.byondr.co,eventgate-backend-staging.fly.dev" \
  CSRF_TRUSTED_ORIGINS="https://eventgate-staging.byondr.co,https://api.eventgate-staging.byondr.co,https://frontend-five-lovat-94.vercel.app"
```

(`CSRF_TRUSTED_ORIGINS` keeps the `.vercel.app` origin for backward compat during the cutover window.)

### 4.7 Vercel project config

- **New prod project `eventgate`** — connect to `byondr/eventgate` GitHub repo (post-transfer), production branch `main`. Custom domain `eventgate.byondr.co`. Env vars: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=eventgate_bot`, plus any other `NEXT_PUBLIC_*` currently set on the staging project (mirror them over).
- **Existing staging project `frontend-five-lovat-94`** — add `eventgate-staging.byondr.co` as an additional custom domain. No re-deploy needed beyond Vercel's automatic domain attachment.

## 5. Wave structure (~5 days focused work + async DNS waits)

| Wave | Owner | Status | Effort |
|---|---|---|---|
| **0** | You | ✅ done | Resend `mail.byondr.co` verified; Khmer = `អ៊ីវ៉ិនហ្គេត` from Vatana; Click Cam +2-week slip confirmed; byondr.co DNS state mapped |
| **1** | You + me | in progress | Plan J spec (this doc) + impl plan; PR #1 of Plan J |
| **2** | You | pending | Create GitHub `byondr` org; create new Fly app + Neon prod branch + Upstash prod + Sentry prod project + Tigris bucket. Capture all credentials |
| **3** | Me (agent in worktree) | pending | Internal code rename `gatethres` → `eventgate` (cookie, SW cache, Celery name, manifest, package metadata, brand strings, brief, README, runbook §1.4) |
| **4** | You | pending | Transfer repo to `byondr/eventgate`; update local remote; rotate `@eventgate_bot` token; (webhook re-point happens after Wave 6 deploys) |
| **5** | You | pending | Paste 4 DNS records at GoDaddy (`eventgate`, `api.eventgate`, `eventgate-staging`, `api.eventgate-staging`) |
| **6** | Me (agent) | pending | Rewrite `fly.prod.toml` + `deploy-backend-prod.yml` from `gatethres-backend` → `eventgate-backend`; set prod Fly secrets + staging Fly secrets diff; first deploy of `eventgate-backend`; run `setup_telegram_webhook` against prod |
| **7** | Me (agent) | pending | Vercel: create prod project, add custom domain; staging: add `eventgate-staging.byondr.co` as additional domain. Both via dashboard handoff (cannot fully automate without vercel CLI auth) |
| **8** | Me + You | pending | Prod env smoke: Plan F regression + Plan G smoke + Resend deliverability test (to a non-owner address; verified domain now allows) + Sentry test event + Telegram webhook health |
| **9** | Me | pending | Docs sweep — README + brief + runbook + improvement log + handoff. Bake in Khmer `អ៊ីវ៉ិនហ្គេត`. Mark Plan J complete |

PRs land in ~3 groups:

- **PR #1** — Plan J docs (this spec + impl plan) + internal code rename (Waves 1, 3)
- **PR #2** — `eventgate-backend` Fly config + staging Fly secrets diff + Vercel notes (Waves 6, 7) — most of Wave 2 + Wave 4 + Wave 5 happen outside PRs as user actions
- **PR #3** — Smoke results + docs sweep + closeout (Waves 8, 9)

## 6. Risk + reversibility

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Eventgate TM conflict surfaces post-rename | Low–Med | Med (could force another rename) | Optional 5-min USPTO TESS/EUIPO check during Wave 0; byondr.co umbrella absorbs most TM risk |
| New Fly app fails to provision (region limits, billing, etc.) | Low | High (blocks Wave 6) | Fly has been reliable; fallback: stay on `eventgate-backend-staging` for pilot |
| Neon prod branch creation issues | Low | High (no DB = no app) | Neon is fast; fallback: reuse staging branch with `SENTRY_ENVIRONMENT=prod` for telemetry isolation |
| Vercel doesn't issue cert for `eventgate.byondr.co` after CNAME resolves | Low | High (frontend 5xx) | Vercel issuance is normally automatic; force-refresh via dashboard if stuck |
| `setup_telegram_webhook` doesn't fire because `flyctl secrets set` skips release_command | Med (we hit it in Plan H) | Med (Telegram bot quiet) | Push any backend commit to trigger full deploy w/ release_command, OR run command manually |
| Cookie rename logs everyone out mid-pilot-prep | High (by design) | Low if scheduled | Ship cookie rename in Wave 3, well before pilot opens 2026-06-19. No active prod sessions exist yet |
| SW cache bump fails to invalidate on operator devices | Med | High (operators stuck on stale PWA) | Cache-key bump v2 → v3 forces refetch; verify on Vatana's device during T-1 dry-run |
| Two PRs from this branch can't merge cleanly with each other | Low | Low (rebase resolves) | Land PR #1 first; PR #2 + #3 branch from updated main |
| Resend free-tier still blocks sending to non-verified-recipients | Low | High (no QR delivery) | Domain is verified, so this shouldn't happen — but Wave 8 smoke explicitly tests deliverability to a non-owner address as proof |

**Reversibility:**

| Action | Reversal |
|---|---|
| Create `byondr` GitHub org | Delete org (GitHub keeps it free indefinitely) |
| Transfer repo to `byondr/eventgate` | Transfer back to `vineidev/...`; redirects from old URL keep working both directions |
| Provision new Fly app | `flyctl apps destroy eventgate-backend` |
| New Neon prod branch | Delete branch |
| New Upstash | Delete instance |
| New Sentry project | Delete project |
| New Tigris bucket | Empty + delete |
| Add DNS records at GoDaddy | Revert in DNS manager |
| Vercel domain attachment | Remove from project domains |
| Code rename | `git revert` per commit (each wave is its own PR) |
| Cookie + SW rename | Re-revert + bump cache key again |

## 7. Acceptance criteria

Plan J is "done" when ALL green:

- [ ] `curl -I https://eventgate.byondr.co` → 200 with Vercel cert
- [ ] `curl -I https://api.eventgate.byondr.co/api/health/` → 200 with Fly cert
- [ ] `curl -I https://eventgate-staging.byondr.co` → 200 with Vercel cert (staging mirror works too)
- [ ] `curl -I https://api.eventgate-staging.byondr.co/api/health/` → 200 with Fly cert
- [ ] Login flow on `eventgate.byondr.co` succeeds end-to-end (magic-link from `noreply@mail.byondr.co` arrives → click → land on dashboard)
- [ ] Register a test guest → email delivers QR PNG to a non-owner address (proves verified-domain Resend works)
- [ ] Scan flow works on prod
- [ ] Telegram `getWebhookInfo` shows `url=https://api.eventgate.byondr.co/api/v1/telegram/webhook/`, `pending_update_count<10`, no error
- [ ] Sentry receives a deliberate test exception tagged `environment=prod` within 60s
- [ ] Tigris bucket receives a CSV import via the test flow
- [ ] Pre-commit + GHA CI green on all gates after rename
- [ ] Runbook §1.4 production column reads `eventgate.byondr.co` / `api.eventgate.byondr.co` (not the old staging-as-prod URLs)
- [ ] README brand-row + brief §14 row 1 updated to reference Eventgate + byondr umbrella + Khmer `អ៊ីវ៉ិនហ្គេត`
- [ ] Memory updated: `project_brand_pick.md` reflects "brand = Eventgate, umbrella = byondr"
- [ ] Handoff doc captures the new world

## 8. Connection to other docs

- [`docs/plans/2026-05-24-plan-h-brand-rename-and-prod-split.md`](2026-05-24-plan-h-brand-rename-and-prod-split.md) — original Plan H design; Eventgate→Gatethres rename + deferred prod split. Plan J revisits both.
- [`docs/plans/2026-05-24-plan-h-execution.md`](2026-05-24-plan-h-execution.md) — what Plan H shipped vs deferred.
- [`docs/plans/2026-05-25-plan-i-prod-env-split.md`](2026-05-25-plan-i-prod-env-split.md) — Plan I prod split design (now folded into Plan J; the `fly.prod.toml` + `deploy-backend-prod.yml` from PR #8 get renamed in Wave 6 of Plan J, not rebuilt).
- [`docs/plans/2026-05-23-pilot-launch-runbook.md`](2026-05-23-pilot-launch-runbook.md) §1.4 — env URL placeholder rows get filled with the byondr URLs in Wave 9.
- [`docs/plans/improvement-and-findings-logs.md`](improvement-and-findings-logs.md) — operational gotchas (Fly SSH ENV, `flyctl secrets set` skipping release_command, etc.) — apply throughout Plan J.
- [`docs/handoff-2026-05-25-pilot-prep.md`](../handoff-2026-05-25-pilot-prep.md) — earlier state of pilot prep.

## 9. Follow-ups (deferred from this plan)

- **TM filing for byondr.co or Eventgate.** Optional Wave 0 check; formal filing deferred.
- **byondr.co landing page** at the apex.
- **Other byondr products** — each gets its own plan.
- **Multi-region Neon read replica** — only if pilot growth justifies.
- **Daily logical pg_dump backup** — same trigger.
- **Vercel team transfer** — once a `byondr` Vercel team is created, the `eventgate` project transfers.
