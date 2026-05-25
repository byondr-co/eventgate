# Plan I — Production Environment Split

> **Status:** scaffolding + sequencing plan written 2026-05-25. Repo-side artifacts land in this PR. Cloud provisioning + DNS happen out-of-session (operator-driven), tracked in §6 below.
>
> **Context:** Plan H shipped the brand rename (Eventgate → Gatethres) and explicitly **deferred the prod env split** per scope amendment 2026-05-24. The pilot 2026-06-05 → 2026-07-03 runs on the existing staging infrastructure under the Gatethres brand. Plan I is the deferred half — provisioning a real prod environment alongside staging — and is now being scoped properly so it can ship post-pilot (or in parallel with the pilot if operator bandwidth allows).
>
> **Why now:** post-pilot we want a clean prod env that never carried staging test data. Even if pilot succeeds on staging, that infra carries fake guests, simulated conflicts, and operator experiments — bad data lineage for a paying customer.

## 1. Goal

Provision a fresh **prod** environment alongside the existing **staging** environment, with full isolation (separate DB, separate Redis, separate Sentry project, separate Resend domain, separate object storage, separate Telegram webhook target), and cutover `gatethres.com` to point at it. Staging keeps running indefinitely as the shakedown env.

## 2. Out of scope

- **Staging data migration to prod.** Prod starts empty by design (Plan H §3.4). The first paying customer's data lives only on prod.
- **Custom brand identity (logo, colors, marketing site).** Separate workstream.
- **Multi-region prod.** Singapore-only for v1, matching staging.
- **Defensive TLD registrations beyond `gatethres.com`.** Deferred per Plan H §6 Q3.
- **Renaming the local Dexie DB on the frontend.** Internal name, no user impact (Plan H §2.1 note).

## 3. Target state

| Resource | Staging (keep) | Prod (new) |
|---|---|---|
| Fly backend app | `eventgate-backend-staging` | `gatethres-backend` (Singapore `sin`) |
| Vercel frontend | `frontend-five-lovat-94` | `gatethres-app` |
| Postgres | Neon staging branch | Neon prod branch (fresh empty DB) |
| Redis | Upstash staging | Upstash prod (Singapore) |
| Sentry | personal-org / `eventgate` | personal-org / `gatethres` (new project) |
| Resend | sender `onboarding@resend.dev` | sender `noreply@mail.gatethres.com` |
| Tigris media bucket | `eventgate-backend-staging-media` | `gatethres-backend-media` |
| Telegram bot | `@gatethres_bot` (pointed at staging) | `@gatethres_bot` (pointed at prod after cutover) |
| Apex DNS | `frontend-five-lovat-94.vercel.app` (Vercel-managed) | `gatethres.com` → Vercel (prod project) |
| API DNS | `eventgate-backend-staging.fly.dev` | `api.gatethres.com` → Fly (`gatethres-backend`) |
| Email domain | `resend.dev` (default) | `mail.gatethres.com` (verified) |
| GHA deploy target | `--app eventgate-backend-staging` (existing workflow) | `--app gatethres-backend` (new workflow, manual-dispatch / tag-trigger) |

## 4. Decisions captured

These are inherited from Plan H §3 + §4. Re-affirmed 2026-05-25; no new decisions to make.

| Question | Decision | Source |
|---|---|---|
| Pilot runs on staging or prod? | **Staging** (Plan H scope amendment) | Plan H wrap-up 2026-05-25 |
| Migrate staging data to prod? | **No** — prod starts empty | Plan H §3.4 |
| Which TLD for prod? | `gatethres.com` only | Plan H §6 Q3 ANSWERED |
| Telegram bot — rename or new? | Single bot `@gatethres_bot` already exists (Plan H T4); webhook re-points on cutover | Plan H T4 |
| DNS registrar? | Cloudflare Registrar (domain already registered there per Plan H §1.4) | Plan H T1 |
| Cutover timing | Post-pilot. Hard cutover, not blue/green — staging keeps running but stops being canonical | this doc §7 |
| Email sender for prod | `noreply@mail.gatethres.com` after Resend domain verification | Plan H §3.1 + §3.2 |
| Backup / DR strategy for prod | Neon's built-in PITR — no separate snapshot job for pilot scale | this doc §9 |

## 5. Repo-side scaffolding (lands in THIS PR — `feature/plan-i-prod-split`)

These are the artifacts I can build without any external cloud account access. They sit dormant in `main` until the operator runs the user-side tasks in §6.

### 5.1 `backend/fly.prod.toml` (new)

Prod Fly app config. Same shape as `backend/fly.toml` but targeting `gatethres-backend`. Created in Task 1 of the execution checklist (§7). Differences vs staging:
- `app = "gatethres-backend"` (was `eventgate-backend-staging`)
- All other settings identical (same Singapore region, same 3 process groups: app/worker/beat, same release_command, same memory sizing)
- No env-tagged secrets in the file — secrets are set via `flyctl secrets set` against the prod app

### 5.2 `.github/workflows/deploy-backend-prod.yml` (new)

Separate workflow for prod deploys, **not** auto-triggered on push to main. Manual `workflow_dispatch` + `release` published trigger. This keeps the staging deploy auto-on-push (so operator gets fast iteration) while prod deploys go through an explicit human gate.

Key shape:
- Triggers: `workflow_dispatch` (manual button in GH Actions UI) + optional `release` `published` (when you tag a release)
- Uses a separate `FLY_API_TOKEN_PROD` secret (so prod can't be deployed with the staging token by accident)
- Same flyctl command as staging but with `--config fly.prod.toml --app gatethres-backend`

### 5.3 `backend/config/settings/prod.py` audit (no changes expected)

Already environment-driven (verified 2026-05-25). All cloud-specific config is via env vars (`SENTRY_DSN`, `RESEND_API_KEY`, `BUCKET_NAME`, `ALLOWED_HOSTS`, etc.). Sentry environment tag comes from `SENTRY_ENVIRONMENT` env var, defaulting to `"staging"` — prod will set this to `"prod"`. **No code change needed.**

### 5.4 Env var diff table (lives in this plan §11 + as commit-time comment in `fly.prod.toml`)

The full secret list that prod needs (compared to staging) is in §11.

### 5.5 DNS record specification (this doc §6.3)

Exact records to paste into Cloudflare for `gatethres.com`, `api.gatethres.com`, and the Resend domain `mail.gatethres.com`. Operator pastes; no code commit needed.

### 5.6 Cutover runbook (§7 of this doc + a new section in the pilot launch runbook)

Step-by-step ordering with verification checkpoints. After PR merges, the pilot launch runbook gets a §1.6 "Post-pilot prod cutover" subsection pointing at this plan.

### 5.7 README "Two environments" section (optional, in this PR)

Add a brief "Staging vs Prod" callout near the top of `README.md` documenting that both envs exist post-cutover.

---

## 6. User-action checklist (cannot be done in this session)

These need your hands at the relevant cloud dashboards / `flyctl` / Cloudflare. Each row links back to the spec section that informed it. **Do not start before the pilot ends** unless you explicitly want to provision in parallel (acceptable; just don't cut DNS over until staging is no longer canonical).

### 6.1 New cloud accounts / projects

- [ ] **Neon — create new prod branch.** Neon dashboard → `eventgate` project → create branch `prod`. Capture the new `DATABASE_URL` (write to `flyctl secrets set --app gatethres-backend DATABASE_URL=postgresql://…`). Apply audit trigger via the standard migration path on first deploy.
- [ ] **Upstash — create new prod Redis.** Upstash dashboard → New Database → Singapore region → name `gatethres-prod`. Capture `REDIS_URL`.
- [ ] **Sentry — create new prod project.** Sentry dashboard → personal-org → New Project → Django → name `gatethres`. Capture the new DSN. Pre-emptively mute audit-trigger-blocked-write test exceptions (per Plan H §3.1).
- [ ] **Resend — verify `mail.gatethres.com`.** Resend dashboard → Domains → Add Domain `mail.gatethres.com`. Resend generates DKIM + MX + SPF records — paste at Cloudflare (§6.3). Wait for verification (~5min to 24h propagation). Set `RESEND_FROM_EMAIL=noreply@mail.gatethres.com`.
- [ ] **Tigris — create new prod bucket.** Easiest path: `flyctl storage create --app gatethres-backend` (after `gatethres-backend` exists). This auto-provisions a bucket and injects `BUCKET_NAME` + AWS-compatible creds as Fly secrets.

### 6.2 Provision the new Fly app

Run from the repo root after PR merges:

```bash
cd backend
flyctl apps create gatethres-backend --org personal
flyctl deploy --config fly.prod.toml --remote-only --app gatethres-backend
```

The first `flyctl deploy` will fail without secrets — that's expected. Set the prod secrets (§6.4) first, then re-deploy. Verify the app starts on `https://gatethres-backend.fly.dev/api/health/`.

### 6.3 DNS records at Cloudflare

Paste these in the `gatethres.com` zone at Cloudflare. **Proxy status:** orange-cloud (proxied) for the apex and `api` records; **DNS-only** (grey-cloud) for Resend records (mail providers don't tolerate Cloudflare proxying).

| Type | Name | Content | TTL | Proxy |
|---|---|---|---|---|
| `A` or `CNAME` | `@` (apex) | follow Vercel's `vercel-dns.com` or A records (Vercel project domain settings page lists exact values) | Auto | Off (Vercel handles SSL) |
| `CNAME` | `api` | `gatethres-backend.fly.dev` | Auto | On (CF SSL) |
| `MX` | `mail` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) — exact value comes from Resend | Auto | Off |
| `TXT` | `mail` | SPF: `v=spf1 include:amazonses.com ~all` | Auto | Off |
| `TXT` | `resend._domainkey.mail` | DKIM key (provided by Resend during domain setup) | Auto | Off |

After paste, verify:
- `dig +short api.gatethres.com` returns the Fly proxy IP
- `dig +short gatethres.com` returns Vercel's IPs
- Resend dashboard shows `mail.gatethres.com` as **Verified** (may take up to 24h)
- `curl -I https://api.gatethres.com/api/health/` returns 200 (after Fly attaches the cert)
- `curl -I https://gatethres.com` returns 200 (after Vercel attaches the cert; requires the new Vercel project to add `gatethres.com` as a production domain)

### 6.4 Set Fly secrets on `gatethres-backend`

After §6.1–§6.3 produce the secret values, set them all in one batch (Fly restarts the app on each `secrets set`, so batch via `--stage`):

```bash
flyctl secrets set --app gatethres-backend --stage \
  DATABASE_URL="<from Neon §6.1>" \
  REDIS_URL="<from Upstash §6.1>" \
  SENTRY_DSN="<from Sentry §6.1>" \
  SENTRY_ENVIRONMENT="prod" \
  RESEND_API_KEY="<from Resend, can reuse staging key — it's per-account not per-domain>" \
  RESEND_FROM_EMAIL="noreply@mail.gatethres.com" \
  DEFAULT_FROM_EMAIL="Gatethres <noreply@mail.gatethres.com>" \
  SECRET_KEY="$(openssl rand -hex 64)" \
  ALLOWED_HOSTS="api.gatethres.com,gatethres-backend.fly.dev" \
  CSRF_TRUSTED_ORIGINS="https://gatethres.com,https://api.gatethres.com" \
  TELEGRAM_BOT_TOKEN="<reuse from staging; the bot is the same>" \
  TELEGRAM_BOT_USERNAME="gatethres_bot" \
  TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  TELEGRAM_WEBHOOK_URL="https://api.gatethres.com/api/telegram/webhook/"

flyctl deploy --config fly.prod.toml --remote-only --app gatethres-backend
```

After the deploy:
- Verify `flyctl ssh console --app gatethres-backend --command "/app/.venv/bin/python manage.py check --deploy"` returns 0 warnings (or only known-OK ones)
- Verify Telegram webhook with `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .` — `url` should be `https://api.gatethres.com/api/telegram/webhook/`, `pending_update_count < 10`
- Verify Resend by sending a test email: `flyctl ssh console --app gatethres-backend --command "/app/.venv/bin/python manage.py shell -c 'from django.core.mail import send_mail; send_mail(\"prod test\", \"hi\", None, [\"<your-email>\"])'"`

### 6.5 Create the Vercel prod project

Vercel dashboard → New Project → Import from GitHub → `vineidev/gatethres`. Name it `gatethres-app`. Set production branch = `main`. Set env vars:

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.gatethres.com` | Used by `frontend/lib/api.ts` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | `gatethres_bot` | Used by Telegram deep-link |
| `SENTRY_DSN` (server) | from §6.1 — distinct from backend's DSN if you want separate frontend errors | optional for v1 |
| Any other `NEXT_PUBLIC_*` currently set on staging Vercel | mirror over | check `frontend-five-lovat-94` for the full list |

Add custom domain `gatethres.com` (and `www.gatethres.com` if desired) in the project's Domains page. Vercel emits SSL.

### 6.6 Switch GHA prod deploys on (one-line repo edit, can be done after PR merges)

On the new `deploy-backend-prod.yml` workflow, the `FLY_API_TOKEN_PROD` secret needs to be set at the repo level: GitHub → repo settings → Secrets and variables → Actions → New secret. Use a fresh prod token: `flyctl tokens create deploy --app gatethres-backend --expiry 720h` and paste.

---

## 7. Cutover sequencing (when prod is ready to become canonical)

Post-pilot. Do this in one focused session — total ~2 hours including verification windows.

1. **Confirm Resend domain is verified.** Check Resend dashboard. If not verified yet, stop and wait.
2. **Confirm `gatethres-backend` is healthy.** `curl https://api.gatethres.com/api/health/` → 200. `flyctl logs --app gatethres-backend` shows no errors.
3. **Confirm Vercel prod project is healthy.** Push a no-op commit; `gatethres.com` serves the new build.
4. **Move Telegram webhook from staging to prod.** Already done in §6.4 via `setup_telegram_webhook` running as part of release_command — verify with `getWebhookInfo`. The bot identity is unchanged (`@gatethres_bot`); only the webhook target moves. **Note:** This means staging stops getting Telegram-confirm clicks at this moment. Staging Telegram tests will need a separate webhook target or a paused bot.
5. **Announce internal cutover.** Anyone with active staging URLs in browser bookmarks gets logged out (cookies are domain-scoped). Cloud Operator updates the runbook §1.4 prod-URL rows.
6. **Smoke-test prod end-to-end.** Create a throwaway `gatethres-acceptance` org + a throwaway event on prod. Run Plan F regression smoke against it. Archive + delete the throwaway after. Spend ~30 min here.
7. **Lock the runbook §1.4 to prod URLs.** Edit the `Production` column rows from staging URLs to prod URLs. Add a one-line dated handoff line.
8. **Update README + brief to reference prod URLs.**

Reversal: if anything goes wrong post-cutover, the staging env is unchanged and can be re-pointed at `gatethres.com` by reverting the Cloudflare CNAME for `api` and the Vercel domain mapping. Worst-case rollback time: ~15 min once you decide.

---

## 8. Risk + rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Resend domain verification takes >24h, blocking prod email | Low–Med | High (no QR delivery) | Start §6.1 Resend setup 48h before planned cutover. Resend fallback: keep `RESEND_FROM_EMAIL` on `onboarding@resend.dev` temporarily; switch when verified. |
| Cloudflare DNS proxy + Fly cert handshake fails | Low | High (api.gatethres.com 5xx) | Turn proxy off (grey-cloud) for `api` if Fly cert provisioning errors. Cloudflare cert is independent of Fly's. |
| Vercel + apex DNS misconfig serves wrong project | Med | High (gatethres.com points at old staging) | Verify with `dig +short gatethres.com` matching Vercel's documented IPs BEFORE adding the domain to the prod Vercel project. |
| GHA prod deploy accidentally triggers from a PR | Med | Medium (untested code lands prod) | New workflow has `workflow_dispatch` only — no `push` trigger. Manual gate. |
| `SECRET_KEY` rotation invalidates active prod sessions | Inevitable | Low (cutover is post-pilot — no active prod sessions exist) | Plan for: cutover happens when no operator has an active session. New SECRET_KEY is correct policy. |
| Audit trigger fails to apply on first prod deploy | Very Low | High (compliance gap) | `release_command` runs migrations; if migration fails, deploy is rolled back. Verify trigger by running `\d+ audit_events` in `psql` against prod DB after first deploy. |

**Reversibility table** — every step is reversible:

| Step | Reversal |
|---|---|
| Create `gatethres-backend` | `flyctl apps destroy gatethres-backend` |
| Create Vercel project | Delete from dashboard |
| Create Neon prod branch | Delete branch |
| Create Upstash prod | Delete instance |
| Create Sentry prod project | Delete project |
| Verify Resend domain | Remove from dashboard (DNS records can stay) |
| Create Tigris bucket | Empty + delete |
| Add DNS records | Revert in Cloudflare |
| Cutover Telegram webhook | Re-run `setup_telegram_webhook` against staging backend |

---

## 9. Backup / DR

For pilot scale, Neon's built-in PITR (point-in-time recovery, 7-day window on free tier) is sufficient. No separate backup job needed for v1. Document in this section so it's not forgotten when scale grows.

If pilot grows to >1k events/month, revisit:
- Daily logical dump via `pg_dump` to Tigris (separate bucket from media)
- Cross-region Neon read replica for DR

These are out of scope for v1.

---

## 10. Acceptance criteria

Prod is "done" when ALL of these are green:

- [ ] `curl -I https://gatethres.com` → 200 with Vercel cert
- [ ] `curl -I https://api.gatethres.com/api/health/` → 200 with Fly cert
- [ ] Login flow on `gatethres.com` succeeds end-to-end (magic-link email arrives from `noreply@mail.gatethres.com`, click → land on dashboard)
- [ ] Create an event → register a guest → email delivers QR → scan flow works
- [ ] Telegram webhook `getWebhookInfo` shows `url=https://api.gatethres.com/api/telegram/webhook/`, `pending_update_count<10`, `last_error_message=""`
- [ ] Sentry receives a deliberate test exception (curl a 500-trigger endpoint) and tags it `environment=prod`
- [ ] Tigris bucket receives a CSV import (test import → check Tigris dashboard for the object)
- [ ] Runbook §1.4 production column reads prod URLs (not staging)
- [ ] At least one `flyctl deploy --config fly.prod.toml` cycle has completed via the GHA `deploy-backend-prod.yml` workflow (not just a local `flyctl deploy`)

---

## 11. Secret diff — staging vs prod

| Secret | Staging value (current) | Prod value (target) | Owner |
|---|---|---|---|
| `DATABASE_URL` | Neon staging branch URL | Neon prod branch URL | Neon |
| `REDIS_URL` | Upstash staging URL | Upstash prod URL | Upstash |
| `SENTRY_DSN` | personal-org / `eventgate` project DSN | personal-org / `gatethres` project DSN | Sentry |
| `SENTRY_ENVIRONMENT` | `"staging"` (or default) | `"prod"` | none — set inline |
| `RESEND_API_KEY` | shared (per-account) | same shared key | Resend |
| `RESEND_FROM_EMAIL` | `noreply@onboarding.resend.dev` | `noreply@mail.gatethres.com` | none — set inline |
| `DEFAULT_FROM_EMAIL` | `Gatethres <onboarding@resend.dev>` | `Gatethres <noreply@mail.gatethres.com>` | none — set inline |
| `SECRET_KEY` | staging-only random | fresh random (`openssl rand -hex 64`) | none — set inline |
| `ALLOWED_HOSTS` | `eventgate-backend-staging.fly.dev,*.fly.dev` | `api.gatethres.com,gatethres-backend.fly.dev` | none |
| `CSRF_TRUSTED_ORIGINS` | `https://frontend-five-lovat-94.vercel.app` | `https://gatethres.com,https://api.gatethres.com` | none |
| `TELEGRAM_BOT_TOKEN` | from BotFather (staging-pointed) | **same token** (Plan H T4 — single bot) | BotFather |
| `TELEGRAM_BOT_USERNAME` | `gatethres_bot` | `gatethres_bot` (unchanged) | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | random | fresh random (`openssl rand -hex 32`) | none |
| `TELEGRAM_WEBHOOK_URL` | `https://eventgate-backend-staging.fly.dev/api/telegram/webhook/` | `https://api.gatethres.com/api/telegram/webhook/` | none |
| `BUCKET_NAME` | `eventgate-backend-staging-media` | `gatethres-backend-media` | Tigris (via `flyctl storage create`) |
| `AWS_*` (Tigris creds) | staging bucket creds | prod bucket creds | Tigris (via `flyctl storage create`) |

---

## 12. Rollout for this PR

- **Branch:** `feature/plan-i-prod-split` (already created from main tip `23747b0` 2026-05-25; first commit `chore: ignore .superpowers/ brainstorm artifacts` 59e0f7e)
- **Commits in this PR:**
  - `docs(plans): plan I — prod env split design + runbook` (this doc)
  - `feat(deploy): add fly.prod.toml for gatethres-backend`
  - `ci(deploy): add deploy-backend-prod.yml workflow (manual-dispatch + release)`
  - One optional `docs(readme): add staging-vs-prod environment section`
- **Backend changes:** zero code changes. Only new files (Fly config + GHA workflow).
- **Tests:** existing test suite must stay green — no behavioral changes. No new tests needed (config files don't have unit tests).
- **PR target:** `main`. Merge style: rebase (matches PR #6 + #7).
- **Effect on prod when merged:** zero. The new fly.prod.toml + workflow are inert until §6 user-action steps are run. Pilot continues on staging unaffected.

---

## 13. Follow-ups (deferred from this plan)

- **Multi-region Neon read replica** — if pilot growth justifies (>1k events/month).
- **Daily logical pg_dump backup job** — same trigger.
- **Cross-region Fly app** — only if pilot extends to non-SEA customers.
- **Brand identity / marketing site** — Plan J or later.
- **Custom Vercel domain for staging** (e.g., `staging.gatethres.com`) — currently staging uses `frontend-five-lovat-94.vercel.app`; a friendlier URL is nice-to-have but not blocking.
- **Wildcard DNS** for `*.gatethres.com` — only if multi-tenant subdomains become a feature.

---

## 14. Connection to other docs

- **Plan H spec** [`2026-05-24-plan-h-brand-rename-and-prod-split.md`](2026-05-24-plan-h-brand-rename-and-prod-split.md) §3 + §4 — source-of-truth design for everything in this plan
- **Plan H execution** [`2026-05-24-plan-h-execution.md`](2026-05-24-plan-h-execution.md) — what shipped vs deferred
- **Pilot launch runbook** [`2026-05-23-pilot-launch-runbook.md`](2026-05-23-pilot-launch-runbook.md) §1.4 — environment URLs (will need a final update post-cutover per §7 step 7)
- **Improvement + findings log** [`improvement-and-findings-logs.md`](improvement-and-findings-logs.md) — operational gotchas that informed §8 risk table
- **Handoff 2026-05-25** [`../handoff-2026-05-25.md`](../handoff-2026-05-25.md) — current post-pilot-prep state
