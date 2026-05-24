# Plan H Execution Plan — brand rename to Gatethres + prod env split

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product brand from working-name "Eventgate" to **Gatethres** (pronounced GATE-thress), and provision a separate prod environment on Fly + Vercel + Neon + Upstash + Sentry + Resend + Tigris alongside today's staging, so the first-pilot event (The Click Cam, 2026-06-05 → 2026-07-03) runs on a clean prod env at `gatethres.com` + `api.gatethres.com`.

**Architecture:** Each task = one wave = one PR (per user's per-task-worktree workflow). Tasks 0–4 are infrastructure-only (no source-tree edits except `fly.prod.toml`). Task 5 is the bulk code/config rename (one big PR, ~30 files). Tasks 6–10 are documentation, GitHub-side, i18n, smoke, and closeout. Strict ordering: every task blocks the next except where flagged parallelizable.

**Tech Stack:** Cloudflare Registrar + DNS, Fly.io CLI (`flyctl`), Vercel CLI (`vercel`), Neon CLI (`neonctl`), Upstash dashboard, Sentry dashboard, Resend dashboard, Tigris (S3-compatible) CLI, Telegram BotFather, Django 5 + DRF backend, Next.js 14 frontend PWA, GitHub Actions.

**Spec:** [`docs/plans/2026-05-24-plan-h-brand-rename-and-prod-split.md`](./2026-05-24-plan-h-brand-rename-and-prod-split.md) — read this first; it's the design rationale + rename surface inventory + risk table that this plan implements.

**Timeline:** Pilot opens 2026-06-05. Risk-line per runbook says "shipped by 2026-05-29." Today is 2026-05-24 → 5 working days to land waves 0–7, then ~3 days slack for waves 8–10 and pilot prep.

---

## 📌 Scope amendment 2026-05-24 — defer prod env split

> **User decision after T0+T1 sign-off:** keep the pilot running on the **existing staging infrastructure** (`eventgate-backend-staging.fly.dev` + `frontend-five-lovat-94.vercel.app`) and execute only the brand-rename portion of Plan H now. The full prod env split is deferred to a future plan.
>
> **Effect on tasks:**
>
> | Task | Original | Amended |
> |---|---|---|
> | T0 — TM/handle | user-driven | ✅ done — Gatethres clean |
> | T1 — domain/handles | user-driven | ✅ done — `gatethres.com` registered, GitHub `gatethres` org created |
> | **T2 — Prod infra (Fly/Vercel/Neon/Upstash/Sentry/Resend/Tigris)** | provision new prod resources | **🅓 DEFERRED — track as separate plan** |
> | **T3 — DNS + SSL** | point `gatethres.com` + `api.gatethres.com` at new prod | **🅓 DEFERRED — `gatethres.com` registered but not pointed anywhere; revisit when prod split lands** |
> | T4 — Telegram bot | rename + re-point webhook at prod backend | **AMENDED** — BotFather does NOT support username changes; **create a fresh `@gatethres_bot`** instead; webhook URL stays at staging (`https://eventgate-backend-staging.fly.dev/api/v1/telegram/webhook/`); `setup_telegram_webhook` must run once to register the new bot's webhook; leave `@eventgate_bot` alone as a safety net for old links |
> | T5 — Repo internal rename | as written | **AS-IS** — bulk of work; ~30 files |
> | T6 — Docs rename | runbook §1.4 placeholders filled with prod URLs | **AMENDED** — runbook §1.4 explicitly notes "prod URLs deferred"; brand fields fill in (Sentry slug, Tigris bucket placeholder), URL fields stay at staging until future plan |
> | T7 — GitHub repo rename | rename + flip workflow `--app` flag to `gatethres-backend` | **AMENDED** — rename repo `eventgate` → `gatethres`; **workflow `--app` flag stays at `eventgate-backend-staging`** (no prod app to point at yet) |
> | T8 — Khmer strings | as written | **AS-IS** — Vatana review packet |
> | **T9 — Prod env smoke** | Plan F + G checklists vs new prod | **AMENDED** — regression smoke vs **staging** post-rename (verify nothing broke; not pilot-readiness for new prod, since prod doesn't exist yet) |
> | T10 — Closeout | mark brand row ✅ in runbook | **AMENDED** — brand row ✅; prod-URL row stays ⏳ with note "deferred to Plan H-prod-split or successor" |
>
> **What this means for the pilot:** First-pilot event (The Click Cam, 2026-06-05) runs on the **staging** infrastructure under the new "Gatethres" brand. This is acceptable because (a) staging has been through all the runbook gates (Plan F + Plan G + cross-device re-verification all green as of 2026-05-23), (b) staging is in the same Singapore region with the same Neon DB + Upstash + Sentry + Resend + Tigris configuration, (c) the prod split is more about long-term hygiene (clean prod env, isolated from dev/test churn) than pilot-day necessity. The risk is that any test churn during the pilot window contaminates the pilot data — mitigation: **avoid making test events in staging between 2026-06-04 and 2026-07-04**.

---

## Task 0: TM + handle verification (BLOCKER for all subsequent tasks)

> **Owner:** Vinei (user-driven). No code changes. **Cannot start any other task until this signs off clean.** Expected ~10–15 min — Gatethres is a coined truncation with no existing namesakes, so searches should return zero hits.

**Files:**
- Modify: `docs/plans/2026-05-24-plan-h-execution.md` (this file — fill in §Task-0 sign-off section)

- [ ] **Step 1: USPTO TESS search for "Gatethres"**

  Visit [tmsearch.uspto.gov](https://tmsearch.uspto.gov). Search:
  - Term: `Gatethres` — exact phrase
  - Classes: IC 9 (downloadable software) + IC 42 (SaaS / hosted services)
  - Status: Live and Pending

  Expected result: **0 hits**. If hits appear, capture filing-number + class + jurisdiction for §Task-0 sign-off below and pause Plan H pending fallback decision (Slidegate per spec §1.3).

- [ ] **Step 2: EUIPO eSearch for "Gatethres"**

  Visit [tmdn.org/tmview](https://www.tmdn.org/tmview/welcome). Same query, same classes.

  Expected: **0 hits**.

- [ ] **Step 3: IPOS Singapore for "Gatethres"**

  Visit [ipos.gov.sg](https://www.ipos.gov.sg) → Trade Marks → eSearch. Same query.

  Expected: **0 hits**. (Singapore matters because that's our hosting region — Fly `sin`, Neon Singapore.)

- [ ] **Step 4: GitHub org `gatethres` availability**

  Visit [github.com/gatethres](https://github.com/gatethres). Either gets a 404 (available — register in Task 1) or shows an existing org (note fallback: `gatethres-app` or `gatethres-hq`).

- [ ] **Step 5: X/Twitter `@gatethres` handle**

  Visit [x.com/gatethres](https://x.com/gatethres). Either 404 (available) or existing account.

- [ ] **Step 6: npm `gatethres` availability**

  Run locally:
  ```bash
  npm view gatethres
  npm view @gatethres/scope
  ```
  Expected: `npm ERR! 404 'gatethres' is not in this registry.`

- [ ] **Step 7: Fill in §Task-0 sign-off section**

  Edit this file's §Task-0 sign-off section (below) with timestamp + results. If any step surfaces a conflict, stop here and pivot per spec §1.3 fallback chain.

- [ ] **Step 8: Commit sign-off**

  ```bash
  git add docs/plans/2026-05-24-plan-h-execution.md
  git commit -m "docs(plans): plan H task 0 — TM + handle checks signed off (Gatethres clean)"
  ```

### §Task-0 sign-off

> Fill in upon completion.

- **Signed-off by:** Vinei
- **Date:** 2026-05-??
- **USPTO TESS:** ☐ 0 hits / ☐ N hits → details below
- **EUIPO eSearch:** ☐ 0 hits / ☐ N hits → details below
- **IPOS Singapore:** ☐ 0 hits / ☐ N hits → details below
- **GitHub `gatethres`:** ☐ available / ☐ taken — fallback used: `_____`
- **X/Twitter `@gatethres`:** ☐ available / ☐ taken
- **npm `gatethres`:** ☐ available / ☐ taken
- **Conflict details (if any):** _____
- **Decision:** ☐ proceed with Gatethres / ☐ fall back to Slidegate / ☐ fall back to Soglia

---

## Task 1: Domain + handle land-grab

> **Owner:** Vinei (user-driven). Mostly external services. Run only after Task 0 sign-off is clean.

**Files:**
- Modify: `docs/plans/2026-05-24-plan-h-execution.md` (record final names + URLs in §Task-1 sign-off section)

- [ ] **Step 1: Create / sign in to Cloudflare account**

  Visit [dash.cloudflare.com](https://dash.cloudflare.com). Use the same Cloudflare account that will own DNS, or create a new one for the brand.

- [ ] **Step 2: Register `gatethres.com` at Cloudflare Registrar**

  Cloudflare dashboard → Domain Registration → Register Domains → search "gatethres.com" → add to cart → checkout.

  Expected: registered for ~$10/yr. Cloudflare DNS attached by default.

  Verify in terminal after ~2 min:
  ```bash
  dig +short NS gatethres.com
  ```
  Expected: Cloudflare nameservers (e.g., `xxx.ns.cloudflare.com.`).

- [ ] **Step 3: Create GitHub org `gatethres`**

  Visit [github.com/account/organizations/new](https://github.com/account/organizations/new). Org name: `gatethres` (or fallback from Task 0). Plan: Free is fine for the pilot.

  Do NOT transfer the existing `eventgate` repo yet — that happens in Task 7.

- [ ] **Step 4: Reserve X/Twitter `@gatethres`**

  Sign in / sign up at [x.com](https://x.com). Profile handle: `gatethres`. Bio + profile pic can stay placeholder for the pilot.

- [ ] **Step 5: Reserve npm `gatethres` scope (optional but cheap)**

  ```bash
  npm login
  # Reserve as a placeholder package — we may publish nothing
  ```
  Or skip if not publishing npm packages from this repo. Mark as deferred in §Task-1 sign-off.

- [ ] **Step 6: Fill in §Task-1 sign-off**

  Record:
  - Final GitHub org name (and if fallback was used)
  - Final X handle
  - npm reservation status
  - Cloudflare account that owns gatethres.com (for handoff context)

- [ ] **Step 7: Commit sign-off**

  ```bash
  git add docs/plans/2026-05-24-plan-h-execution.md
  git commit -m "docs(plans): plan H task 1 — gatethres.com registered + handles reserved"
  ```

### §Task-1 sign-off

> Fill in upon completion.

- **Signed-off by:** Vinei
- **Date:** 2026-05-??
- **`gatethres.com`:** registered ✅ — Cloudflare account: `_____`
- **GitHub org:** `gatethres` ☐ / fallback `_____` ☐
- **X/Twitter:** `@gatethres` ☐ / fallback `@_____` ☐
- **npm:** registered ☐ / deferred ☐

---

## Task 2: Prod infrastructure provisioning

> **Owner:** Vinei. Mostly external services + one new file in repo (`backend/fly.prod.toml`). Independent from staging — does not touch any existing infra. Sub-tasks 2a–2g are independent and can be done in parallel if desired; I've ordered them by dependency for sequential execution.

**Files:**
- Create: `backend/fly.prod.toml` (copied from `backend/fly.toml` with prod-specific settings)
- Test: smoke commands listed inline per sub-task

### Sub-task 2a: Fly backend app `gatethres-backend`

- [ ] **Step 1: Copy fly.toml to fly.prod.toml**

  ```bash
  cd /Users/vinei/Projects/eventgate
  cp backend/fly.toml backend/fly.prod.toml
  ```

- [ ] **Step 2: Edit `backend/fly.prod.toml` — change app name + region**

  Set `app = "gatethres-backend"` (was `"eventgate-backend-staging"`). Region stays `sin` (Singapore). Confirm `[deploy] release_command` line is intact from the fix in commit `742e061` (`sh -c '... && ...'` wrapper).

- [ ] **Step 3: Create the Fly app**

  ```bash
  cd backend
  flyctl apps create gatethres-backend --org personal
  ```

  Expected: `New app created: gatethres-backend`.

- [ ] **Step 4: Set Fly secrets (placeholders — real values set in 2c–2g)**

  ```bash
  flyctl secrets set --app gatethres-backend \
    SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')" \
    ALLOWED_HOSTS="gatethres-backend.fly.dev,api.gatethres.com" \
    CSRF_TRUSTED_ORIGINS="https://gatethres.com,https://api.gatethres.com" \
    DEBUG="0"
  ```

  Other secrets (DATABASE_URL, REDIS_URL, SENTRY_DSN, RESEND_API_KEY, TIGRIS_*, TELEGRAM_*) are set per sub-task below.

- [ ] **Step 5: Verify app exists**

  ```bash
  flyctl apps list | grep gatethres-backend
  flyctl status --app gatethres-backend
  ```

  Expected: app exists, 0 machines running (we deploy after secrets are in place).

- [ ] **Step 6: Commit fly.prod.toml**

  ```bash
  git add backend/fly.prod.toml
  git commit -m "feat(infra): add backend/fly.prod.toml for gatethres-backend prod app"
  ```

### Sub-task 2b: Neon prod branch

- [ ] **Step 1: Create Neon prod branch**

  Visit [console.neon.tech](https://console.neon.tech) → existing Eventgate project → Branches → Create branch. Branch name: `prod`. Parent: leave as the existing staging branch but **do NOT copy data** (we want an empty prod DB per spec §3.4).

  Alternative via CLI:
  ```bash
  neonctl branches create --project-id <project-id> --name prod --no-copy-data
  ```

- [ ] **Step 2: Get the prod connection string**

  Dashboard → `prod` branch → Connection details → copy the `postgresql://...` string. Use the **pooler** endpoint (port 5432, `-pooler` in host) for Django's psycopg + Fly's network.

- [ ] **Step 3: Set Fly secret `DATABASE_URL`**

  ```bash
  flyctl secrets set --app gatethres-backend \
    DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.singapore-1.aws.neon.tech/neondb"
  ```

- [ ] **Step 4: Sanity-check connection (from local)**

  ```bash
  psql "postgresql://user:pass@ep-xxx-pooler.singapore-1.aws.neon.tech/neondb" -c "SELECT 1"
  ```

  Expected: returns `1`.

- [ ] **Step 5: Commit secret manifest note (no actual secret in repo)**

  No code commit needed for secrets. Move on.

### Sub-task 2c: Upstash Redis prod

- [ ] **Step 1: Create Upstash Redis (prod)**

  Visit [console.upstash.com](https://console.upstash.com) → Create Database. Name: `gatethres-prod`. Region: `ap-southeast-1` (Singapore — matches Fly + Neon). Type: Free tier is sufficient for pilot scale.

- [ ] **Step 2: Get the Redis URL**

  Dashboard → REST/Redis connection details → copy the `rediss://default:...@xxx.upstash.io:6379` string.

- [ ] **Step 3: Set Fly secret `REDIS_URL`**

  ```bash
  flyctl secrets set --app gatethres-backend \
    REDIS_URL="rediss://default:xxx@xxx.upstash.io:6379"
  ```

- [ ] **Step 4: Sanity-check via redis-cli**

  ```bash
  redis-cli -u "rediss://default:xxx@xxx.upstash.io:6379" PING
  ```

  Expected: `PONG`.

### Sub-task 2d: Sentry prod project

- [ ] **Step 1: Create Sentry prod project**

  Visit [sentry.io](https://sentry.io) → personal-org → Projects → Create. Platform: Python (Django). Project name: `gatethres`. Alert frequency: Alert me on every new issue.

- [ ] **Step 2: Get the DSN**

  Project Settings → Client Keys (DSN) → copy the public DSN.

- [ ] **Step 3: Set Fly secret `SENTRY_DSN`**

  ```bash
  flyctl secrets set --app gatethres-backend \
    SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx" \
    SENTRY_ENV="prod" \
    SENTRY_TRACES_SAMPLE_RATE="0.1"
  ```

- [ ] **Step 4: Mute the audit-trigger-blocked-write test exception pre-emptively**

  Sentry → Issues → Filters → Add filter: error class `IntegrityError` AND message contains `audit_auditevent is append-only`. Action: Ignore.

  (This prevents the runbook §1.3 audit-trigger smoke test from spamming the alerts.)

### Sub-task 2e: Resend prod domain `mail.gatethres.com`

- [ ] **Step 1: Add domain to Resend**

  Visit [resend.com/domains](https://resend.com/domains) → Add Domain → `mail.gatethres.com` → region: `us-east-1` (Resend doesn't have Singapore yet; us-east-1 is fine for SEA outbound).

- [ ] **Step 2: Get DNS records Resend wants**

  Resend dashboard shows 3 records to add: MX, SPF (TXT), DKIM (TXT).

- [ ] **Step 3: Add DNS records to Cloudflare**

  Cloudflare dashboard → `gatethres.com` zone → DNS → Add records:
  - Type: MX, Name: `mail`, Mail server: `feedback-smtp.us-east-1.amazonses.com`, Priority: 10
  - Type: TXT, Name: `mail`, Content: `v=spf1 include:amazonses.com ~all`
  - Type: TXT, Name: `resend._domainkey.mail`, Content: (DKIM public key from Resend dashboard)

  Save each. Proxy status: DNS only (gray cloud) for MX + TXT — proxying breaks email DNS.

- [ ] **Step 4: Verify in Resend dashboard**

  Wait ~5 min for DNS propagation. Click "Verify DNS" in Resend. All three records should show green.

- [ ] **Step 5: Set Fly secrets `RESEND_API_KEY` + `RESEND_FROM_EMAIL`**

  ```bash
  flyctl secrets set --app gatethres-backend \
    RESEND_API_KEY="re_xxx" \
    RESEND_FROM_EMAIL="noreply@mail.gatethres.com"
  ```

  (RESEND_API_KEY from Resend dashboard → API Keys → Create.)

- [ ] **Step 6: Defer first send test to Task 9 smoke** — no actionable step here, prod env not yet deployable.

### Sub-task 2f: Tigris bucket `gatethres-backend-media`

- [ ] **Step 1: Provision Tigris bucket via Fly**

  ```bash
  flyctl storage create --app gatethres-backend
  ```

  Fly's interactive prompt: name the bucket `gatethres-backend-media`. Fly automatically sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `AWS_REGION`, `AWS_ENDPOINT_URL_S3` as Fly secrets on the app.

- [ ] **Step 2: Verify the bucket exists**

  ```bash
  flyctl storage list --app gatethres-backend
  ```

  Expected: shows `gatethres-backend-media` with region `auto`.

- [ ] **Step 3: Sanity-check via s3cmd or aws CLI**

  ```bash
  aws s3 ls --endpoint-url https://fly.storage.tigris.dev s3://gatethres-backend-media/
  ```

  Expected: empty bucket, no errors.

### Sub-task 2g: Vercel prod project `gatethres-app`

- [ ] **Step 1: Create Vercel project**

  Visit [vercel.com/new](https://vercel.com/new) → Import existing repo `eventgate` (until it's renamed in Task 7 — Vercel re-binds automatically after rename). Project name: `gatethres-app`. Root directory: `frontend/`. Framework preset: Next.js. Production branch: `main`.

  Do NOT deploy yet — env vars not in place.

- [ ] **Step 2: Set Vercel env vars (prod)**

  Vercel dashboard → gatethres-app → Settings → Environment Variables. Add for **Production** scope:

  - `NEXT_PUBLIC_API_BASE_URL` = `https://api.gatethres.com`
  - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = `gatethres_bot` (set in Task 4)
  - `SENTRY_DSN` = same as backend, or separate frontend project — pick one and document
  - Any other `NEXT_PUBLIC_*` from current staging deploy

  Reference: `frontend/proxy.ts` and `frontend/next.config.mjs` for the full env-var inventory.

- [ ] **Step 3: Verify project exists**

  ```bash
  cd frontend
  pnpm dlx vercel@latest list
  ```

  Expected: shows `gatethres-app` in the list.

- [ ] **Step 4: Sub-task 2g done — leave actual deploy for Task 3 after DNS is in place.**

### Sub-task 2h: Provisional deploy + migration smoke

- [ ] **Step 1: Set placeholder Telegram secrets**

  Telegram bot rename happens in Task 4 — for now set placeholders so the backend boots:

  ```bash
  flyctl secrets set --app gatethres-backend \
    TELEGRAM_BOT_TOKEN="placeholder-set-in-task-4" \
    TELEGRAM_BOT_USERNAME="gatethres_bot" \
    TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
    TELEGRAM_WEBHOOK_URL="https://api.gatethres.com/api/v1/telegram/webhook/"
  ```

- [ ] **Step 2: First deploy of prod backend (using fly.prod.toml)**

  ```bash
  cd backend
  flyctl deploy --config fly.prod.toml
  ```

  Watch the `release_command` log carefully — per runbook §1.3 lesson, this is where the deploy can silently break. Expected: migrations apply to the empty Neon prod branch, container becomes healthy.

- [ ] **Step 3: Verify health endpoint on the fly.dev URL**

  ```bash
  curl -sS https://gatethres-backend.fly.dev/api/health/
  ```

  Expected: `{"status":"ok"}` (or whatever the existing healthcheck returns). 200 status.

- [ ] **Step 4: Verify all migrations applied**

  ```bash
  flyctl ssh console --app gatethres-backend --command "/app/.venv/bin/python manage.py showmigrations | grep -v '\[X\]' | head"
  ```

  Expected: empty (no unapplied migrations).

- [ ] **Step 5: Verify audit trigger present**

  Run the snippet from runbook §1.3 (audit-trigger smoke) against the new app:
  ```bash
  flyctl ssh console --app gatethres-backend --command '/app/.venv/bin/python manage.py shell -c "from django.db import connection
  with connection.cursor() as cur:
      cur.execute(\"SELECT tgname FROM pg_trigger WHERE tgname='\''audit_auditevent_append_only'\''\")
      print('\''trigger present:'\'', bool(cur.fetchone()))"'
  ```

  Expected: `trigger present: True`.

- [ ] **Step 6: Confirm Sentry receives an event**

  Trigger a deliberate 404:
  ```bash
  curl -sS https://gatethres-backend.fly.dev/admin/does-not-exist/
  ```

  Wait ~60s. Check Sentry dashboard → gatethres project → Issues. Expected: at least one issue (could be the 404 or a startup info event).

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git add backend/fly.prod.toml  # (already committed in 2a Step 6; this is a no-op if so)
  git commit --allow-empty -m "infra(plan-h): prod infrastructure provisioned (Fly+Neon+Upstash+Sentry+Resend+Tigris)"
  ```

---

## Task 3: DNS + SSL for `gatethres.com` + `api.gatethres.com`

> **Owner:** Vinei. Cloudflare DNS dashboard work. Blocks Task 5 (cookie rename) because the new cookie domain must match the prod URL.

- [ ] **Step 1: Add A/CNAME records for apex `gatethres.com` → Vercel**

  Vercel dashboard → gatethres-app → Settings → Domains → Add `gatethres.com`. Vercel surfaces the DNS records to add — typically an `A` record at apex pointing to a Vercel IP + a `CNAME` at `www`.

  Cloudflare dashboard → gatethres.com zone → DNS → add the records Vercel specified. Set Proxy status: **Proxied (orange cloud)** for both apex and www. Vercel handles SSL via cert via its edge.

- [ ] **Step 2: Add A record for `api.gatethres.com` → Fly**

  Get the Fly app's IPv4:
  ```bash
  flyctl ips list --app gatethres-backend
  ```

  Copy the public IPv4. Cloudflare DNS: add an A record:
  - Type: A, Name: `api`, IPv4: (from above), Proxy: **DNS only (gray cloud)** — Fly handles SSL via Let's Encrypt directly; Cloudflare proxying breaks the cert request.

- [ ] **Step 3: Attach the custom domain to the Fly app**

  ```bash
  flyctl certs create --app gatethres-backend api.gatethres.com
  ```

  Wait ~2–5 min for cert issuance. Check status:
  ```bash
  flyctl certs show --app gatethres-backend api.gatethres.com
  ```

  Expected: `Status: Ready` + cert details visible.

- [ ] **Step 4: Verify both URLs resolve with valid SSL**

  ```bash
  curl -sSI https://gatethres.com | head -3
  curl -sS https://api.gatethres.com/api/health/
  ```

  Expected: 200 from frontend apex (might be a placeholder page until Wave 5 deploys real code), 200 + healthcheck JSON from backend.

- [ ] **Step 5: Update Fly secrets to reflect final URLs**

  ```bash
  flyctl secrets set --app gatethres-backend \
    ALLOWED_HOSTS="gatethres-backend.fly.dev,api.gatethres.com" \
    CSRF_TRUSTED_ORIGINS="https://gatethres.com,https://api.gatethres.com"
  ```

- [ ] **Step 6: Commit (no source change — note in plan)**

  ```bash
  git commit --allow-empty -m "infra(plan-h): DNS + SSL live for gatethres.com + api.gatethres.com"
  ```

---

## Task 4: Telegram bot — create new `@gatethres_bot` (rename not supported)

> **Owner:** Vinei. **Amended 2026-05-?? after T0+T1+T5+T6 landed:** BotFather does NOT support changing a bot's username after creation (Telegram restriction — only the display name and other attributes are editable via `/editbot`). Per scope amendment, webhook still points at staging (`eventgate-backend-staging.fly.dev`), not a new prod app. **New approach: create a fresh bot `@gatethres_bot`, leave `@eventgate_bot` alone as a safety net for old test links.**

- [ ] **Step 1: Create new bot via BotFather**

  Open Telegram → chat with `@BotFather`:
  - `/newbot`
  - Name: `Gatethres`
  - Username: `gatethres_bot` — must end in `_bot` or `bot`.
  - If `gatethres_bot` is taken, try `GatethresBot`, `gatethres_app_bot`, or `official_gatethres_bot`.

  BotFather replies with the bot token. Save it securely.

- [ ] **Step 2: Update staging Fly secrets with the new bot values**

  ```bash
  flyctl secrets set --app eventgate-backend-staging \
    TELEGRAM_BOT_TOKEN="<new-token-from-botfather>" \
    TELEGRAM_BOT_USERNAME="gatethres_bot" \
    TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"
  ```

  Webhook URL secret stays at the existing staging URL — `https://eventgate-backend-staging.fly.dev/api/v1/telegram/webhook/` — per scope amendment.

- [ ] **Step 3: Register webhook on the new bot**

  Per runbook §1.3 lesson — `flyctl secrets set` does a rolling restart but does NOT re-run `release_command`. The new bot has no webhook configured yet, so this manual step is required:

  ```bash
  flyctl ssh console --app eventgate-backend-staging --command "/app/.venv/bin/python manage.py setup_telegram_webhook"
  ```

  Expected output: `Webhook registered: https://eventgate-backend-staging.fly.dev/api/v1/telegram/webhook/`. Use the full venv-python path explicitly — Fly SSH doesn't inherit the Docker `ENV PATH` so bare `python` resolves to the system Python (no Django) and bare `uv` is not in PATH at all. (See runbook §1.3 gotcha.)

- [ ] **Step 4: Verify via Telegram getWebhookInfo**

  ```bash
  TOKEN="<new-bot-token>"
  curl -sS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | python3 -m json.tool
  ```

  Expected: `url` matches the staging webhook URL, `pending_update_count` < 10, no `last_error_message`. `pending_update_count` should be 0 since this is a fresh bot with no updates queued.

- [ ] **Step 5: Update Vercel env var + redeploy frontend**

  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is inlined at Next.js build time (per runbook §1.3 — including in Server Components), so a redeploy is required for the new value to take effect.

  Vercel dashboard → `frontend-five-lovat-94` project → Settings → Environment Variables. Set:
  - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = `gatethres_bot` (Production scope)

  Then trigger a redeploy: Vercel dashboard → Deployments → "Redeploy" the latest. Or push any commit to `main` to trigger an auto-deploy.

- [ ] **Step 6: End-to-end Telegram test**

  Open Telegram → search `@gatethres_bot` → start a chat → send `/start`. Bot should respond per `backend/apps/notifications/telegram_*` templates.

  If no response: check Sentry, check `flyctl logs --app eventgate-backend-staging | grep -i telegram`.

- [ ] **Step 7: Leave `@eventgate_bot` alone (do NOT delete)**

  Old bot stays. Its webhook still points at the staging Fly app, so any legacy `/start` links in old test emails or chats keep functioning. Post-pilot, archive or delete via BotFather if no longer needed.

- [ ] **Step 8: Commit (empty commit just to log the wave)**

  ```bash
  git commit --allow-empty -m "infra(plan-h): wave 4 — new bot @gatethres_bot live on staging (rename not supported by BotFather)"
  ```

---

## Task 5: Repo internal rename — eventgate → gatethres (largest task)

> **Owner:** Vinei. **All edits in this task become a single PR.** Touches ~30 files. Must pass full test suite (backend pytest + mypy, frontend vitest + tsc + lint + prettier) before merge. Per spec §2.1: leave `frontend/lib/scanner/db.ts` Dexie name AS-IS (renaming orphans offline-queued scans).

**Files (per spec §2.1):**
- Modify: `frontend/lib/scanner/session.ts:1-50` (cookie name)
- Modify: `backend/config/settings/base.py` (cookie names + log prefix + verbose name)
- Modify: `backend/config/settings/test.py` (test cookie names)
- Modify: `docker-compose.yml` (container names + network)
- Modify: `frontend/sw-src/sw.ts` (cache key prefix — **bump major version**)
- Modify: `frontend/public/sw.js` (regenerated from sw-src/sw.ts)
- Modify: `frontend/app/manifest.ts` (PWA `name` + `short_name`)
- Modify: `frontend/app/layout.tsx` (`<title>` + meta)
- Modify: `frontend/app/(app)/layout.tsx` (dashboard header)
- Modify: `frontend/app/scanner/layout.tsx` (scanner header)
- Modify: `frontend/components/auth/login-form.tsx` (login screen brand)
- Modify: `frontend/proxy.ts` (API base URL fallback)
- Modify: `backend/fly.toml` (LEAVE — staging stays "eventgate-backend-staging" per spec §6 Q5)
- Modify: `backend/pyproject.toml` (`name`, `description`)
- Modify: `backend/config/celery.py` (Celery app name — drain queue before deploy)
- Modify: `backend/apps/accounts/models.py` (log line / verbose name)
- Modify: `backend/apps/accounts/tasks.py` (log line / email subject prefix)
- Modify: `backend/apps/accounts/management/commands/dev_login.py` (output strings)
- Modify: `backend/apps/orgs/services.py` (branded strings)
- Modify: `backend/apps/guests/tasks.py` (email subjects + QR body)
- Modify: `backend/apps/events/management/commands/seed_dev_event.py` (dev seed strings)
- Modify: `backend/tests/test_healthcheck.py` (hostname assertion)
- Modify: `backend/tests/test_qr_email_task.py` (email body assertions)
- Modify: `.github/workflows/backend.yml` (CI log labels)
- Modify: `.github/workflows/deploy-backend.yml` (`--app` flag — flip to `gatethres-backend`)
- LEAVE: `frontend/lib/scanner/db.ts` (Dexie DB name stays `eventgate-scanner` per spec §2.1 note)
- LEAVE: historical plan docs in `docs/plans/2026-05-19-*` through `docs/plans/2026-05-23-*`

- [ ] **Step 1: Create a feature branch from main**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git fetch origin
  git checkout -b plan-h/wave-5-rename main
  ```

- [ ] **Step 2: Update `frontend/lib/scanner/session.ts` — cookie name**

  Find the line(s) referencing `eventgate_access` and rename to `gatethres_access`. Likely a constant like:
  ```typescript
  const COOKIE_NAME = "eventgate_access";  // → "gatethres_access"
  ```

  Also check for `eventgate_refresh`, `eventgate_csrf` — rename consistently.

- [ ] **Step 3: Update `backend/config/settings/base.py` — match cookie names**

  Find:
  ```python
  SESSION_COOKIE_NAME = "eventgate_session"
  CSRF_COOKIE_NAME = "eventgate_csrf"
  JWT_AUTH_COOKIE = "eventgate_access"
  # Plus any LOGGING prefix or app verbose_name
  ```
  Rename to `gatethres_*` consistently. **These names MUST match exactly between backend and frontend.**

- [ ] **Step 4: Update `backend/config/settings/test.py` — same renames**

  Mirror the changes from base.py.

- [ ] **Step 5: Update `docker-compose.yml` — container + network names**

  Find services like `eventgate-postgres`, `eventgate-redis`, `eventgate-network`. Rename to `gatethres-*`.

- [ ] **Step 6: Update `frontend/sw-src/sw.ts` — bump cache key**

  The cache key prefix likely looks like `eventgate-v1`. Change to `gatethres-v1` AND bump the major version letter if the file uses one (e.g., `eventgate-v3` → `gatethres-v4`). The version bump forces every installed PWA to invalidate the old cache and refetch.

- [ ] **Step 7: Re-build `frontend/public/sw.js`**

  ```bash
  cd frontend
  pnpm build:sw  # or whatever the SW build command is — check package.json scripts
  ```

  If `frontend/public/sw.js` is generated, it should pick up the change. Verify by grep:
  ```bash
  grep -c 'gatethres' frontend/public/sw.js
  ```

- [ ] **Step 8: Update `frontend/app/manifest.ts` — PWA name**

  ```typescript
  export default function manifest() {
    return {
      name: "Gatethres",          // was "Eventgate"
      short_name: "Gatethres",    // was "Eventgate"
      // ... rest unchanged
    };
  }
  ```

- [ ] **Step 9: Update layout files — visible brand strings**

  - `frontend/app/layout.tsx`: `<title>Gatethres</title>` (or however title is set), meta description.
  - `frontend/app/(app)/layout.tsx`: dashboard header brand.
  - `frontend/app/scanner/layout.tsx`: scanner header brand.
  - `frontend/components/auth/login-form.tsx`: login screen brand line.

- [ ] **Step 10: Update `frontend/proxy.ts` — fallback API URL**

  Default fallback should still point at the **staging** URL (for local dev) since prod is reached via env var:
  ```typescript
  const FALLBACK = process.env.NEXT_PUBLIC_API_BASE_URL || "https://eventgate-backend-staging.fly.dev";
  ```
  This line can stay — staging fly.dev URL is correct for local dev. Only update if the file uses "eventgate" in a non-URL string (e.g., a logger prefix).

- [ ] **Step 11: Update `backend/pyproject.toml`**

  ```toml
  [project]
  name = "gatethres"          # was "eventgate"
  description = "Gatethres — fast, paperless event entrance for Southeast Asia"
  ```

- [ ] **Step 12: Update `backend/config/celery.py` — app name**

  ```python
  app = Celery("gatethres")  # was Celery("eventgate")
  ```

  **Warning:** This changes Celery task routing keys. Before deploying, drain the staging Celery queue (or accept that in-flight tasks may be lost on deploy). For PROD, queue is empty on first deploy — no issue.

- [ ] **Step 13: Update remaining backend files**

  Search-and-replace `eventgate` → `gatethres` (case-preserving) in:
  - `backend/apps/accounts/models.py`
  - `backend/apps/accounts/tasks.py`
  - `backend/apps/accounts/management/commands/dev_login.py`
  - `backend/apps/orgs/services.py`
  - `backend/apps/guests/tasks.py`
  - `backend/apps/events/management/commands/seed_dev_event.py`

  Eyeball each diff before saving. **Do NOT** touch comments referencing historical plan docs (e.g., "see Plan E for offline sync").

- [ ] **Step 14: Update tests**

  - `backend/tests/test_healthcheck.py`: hostname assertion → `gatethres` brand string.
  - `backend/tests/test_qr_email_task.py`: assertion about email subject prefix → `Gatethres` brand string.

- [ ] **Step 15: Update GitHub Actions workflows**

  - `.github/workflows/backend.yml`: log labels referencing "eventgate" → "gatethres".
  - `.github/workflows/deploy-backend.yml`: change the `flyctl deploy --app eventgate-backend-staging` line to deploy BOTH staging and prod — OR — split into two workflow files (`deploy-backend-staging.yml` + `deploy-backend-prod.yml`).

  **Recommend two workflow files** so prod deploys are explicitly gated. Create:
  - `.github/workflows/deploy-backend-staging.yml` (existing, unchanged, targets `eventgate-backend-staging`)
  - `.github/workflows/deploy-backend-prod.yml` (new, targets `gatethres-backend`, triggered on push to `main` after staging passes)

  Or simpler for the pilot: keep one workflow, change `--app` to `gatethres-backend` for `main` branch.

- [ ] **Step 16: Run full backend test suite**

  ```bash
  cd backend
  uv run pytest -q
  ```

  Expected: all tests pass. Look at `tests/test_qr_email_task.py` and `tests/test_healthcheck.py` failures first if any (those are the most likely places brand strings landed).

- [ ] **Step 17: Run mypy**

  ```bash
  cd backend
  uv run mypy apps/
  ```

  Expected: `Success: no issues found in N source files` (per runbook §1.2).

- [ ] **Step 18: Run full frontend gates**

  ```bash
  cd frontend
  pnpm install --frozen-lockfile
  pnpm test            # vitest
  pnpm exec tsc --noEmit
  pnpm lint
  pnpm format:check
  ```

  Expected: all pass. If `format:check` fails, run `pnpm format` and re-commit.

- [ ] **Step 19: Local smoke — start dev server, verify brand strings**

  ```bash
  docker compose up -d
  cd backend && uv run python manage.py runserver &
  cd frontend && pnpm dev
  ```

  Open `http://localhost:3000`. Verify:
  - Browser tab title says "Gatethres"
  - Login screen brand string is "Gatethres"
  - Dashboard header is "Gatethres"
  - Scanner page header is "Gatethres"

  Stop servers when done.

- [ ] **Step 20: Open PR**

  ```bash
  git add -A
  git commit -m "feat(plan-h): wave 5 — internal repo rename eventgate → gatethres"
  git push -u origin plan-h/wave-5-rename
  gh pr create --title "feat(plan-h): wave 5 — internal repo rename eventgate → gatethres" --body "$(cat <<'EOF'
  ## Summary

  - Wave 5 of [Plan H](docs/plans/2026-05-24-plan-h-brand-rename-and-prod-split.md).
  - Renames ~30 active files from \`eventgate\` → \`gatethres\`.
  - Bumps service worker cache key (forces PWA invalidation on next visit).
  - Cookie names change → all logged-in sessions invalidated on deploy.
  - Dexie DB name kept as-is per spec §2.1 (avoids orphaning offline-queued scans).
  - Staging Fly app keeps name \`eventgate-backend-staging\` per spec §6 Q5.
  - GitHub Actions deploy points at \`gatethres-backend\` for \`main\` branch.

  ## Test plan

  - [x] Backend pytest + mypy green
  - [x] Frontend vitest + tsc + lint + prettier green
  - [x] Local dev smoke — brand strings visible in tab title, login, dashboard, scanner

  ## Out of scope (separate waves)

  - Domain DNS (Task 3)
  - Documentation rename (Task 6)
  - GitHub repo rename + workflow re-point (Task 7)
  - Khmer brand-bearing strings (Task 8)
  EOF
  )"
  ```

- [ ] **Step 21: Review and merge**

  Self-review the diff in the PR UI. Look for:
  - Stray `eventgate` references in unintended places (e.g., a comment that explicitly references the working name)
  - Cookie name mismatches between frontend and backend
  - Cache key did get bumped

  Merge with squash.

- [ ] **Step 22: Verify deploy lands green**

  After merge, GHA `Deploy backend` workflow fires. Watch:
  ```bash
  gh run watch
  ```

  Expected: completes success. Then verify:
  ```bash
  flyctl status --app gatethres-backend
  curl -sS https://api.gatethres.com/api/health/
  ```

---

## Task 6: Documentation rename

> **Owner:** Vinei. Docs-only. Can be done in parallel with Task 5 IF on a separate branch. Touches the README, brief, runbook — but NOT historical plan docs.

**Files:**
- Modify: `README.md`
- Modify: `docs/brief.md` (§14 row 1 — mark Phase-0 brand task as resolved → Gatethres)
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md` (§intro brand row ⏳→✅; §1.4 placeholders → `gatethres` values)
- LEAVE: all `docs/plans/2026-05-19-plan-a-*` through `docs/plans/2026-05-23-plan-g-*` (historical)
- LEAVE: `docs/handoff-2026-05-20.md` (historical) — optionally add a one-line preamble noting rename happened on 2026-05-24

- [ ] **Step 1: Create branch**

  ```bash
  git checkout main && git pull --ff-only
  git checkout -b plan-h/wave-6-docs-rename
  ```

- [ ] **Step 2: Update `README.md`**

  Change title from `# Eventgate` to `# Gatethres`. Update repo description if present. Add pronunciation note: `Gatethres (pronounced GATE-thress)`.

- [ ] **Step 3: Update `docs/brief.md` §14 row 1**

  Find the table row at §14:
  ```
  | 1 | Brand / product name | **Direction: abstract & global**...
  ```

  Replace the "Direction" cell with: `**Resolved 2026-05-24 → Gatethres** (pronounced GATE-thress, coined truncation of *gate + thres(hold)*). See [Plan H spec](./plans/2026-05-24-plan-h-brand-rename-and-prod-split.md).`

- [ ] **Step 4: Update `docs/plans/2026-05-23-pilot-launch-runbook.md` §intro**

  Find the "External blockers tracked here" list. Find the `Brand name` row. Change:
  ```
  - **Brand name** — Phase-0 task per brief §12 footer. Status: ⏳ **pending**...
  ```
  to:
  ```
  - **Brand name** — Phase-0 task per brief §12 footer. Status: ✅ **resolved 2026-05-24 → Gatethres** (pronounced GATE-thress). See [Plan H spec](./2026-05-24-plan-h-brand-rename-and-prod-split.md). _Last updated: 2026-05-24._
  ```

- [ ] **Step 5: Update runbook §1.4 placeholders**

  Find the table at §1.4. Each row has a "Pilot (brand TBC)" column with `<brand>` placeholders. Fill in with `gatethres`:
  - Backend API: `https://api.gatethres.com`
  - Dashboard: `https://gatethres.com`
  - Sentry: `<personal-org>/gatethres`
  - Telegram bot: `@gatethres_bot`
  - Tigris bucket: `gatethres-backend-media`

- [ ] **Step 6: Grep for any leftover `<brand>` placeholders in the runbook**

  ```bash
  grep -n '<brand>' docs/plans/2026-05-23-pilot-launch-runbook.md
  ```

  Expected: empty.

- [ ] **Step 7: Open PR**

  ```bash
  git add README.md docs/brief.md docs/plans/2026-05-23-pilot-launch-runbook.md
  git commit -m "docs(plan-h): wave 6 — README + brief §14 + runbook §1.4 updated to Gatethres"
  git push -u origin plan-h/wave-6-docs-rename
  gh pr create --title "docs(plan-h): wave 6 — README + brief + runbook brand updates" --body "Marks brand pick as resolved in brief §14 + runbook §intro. Fills in runbook §1.4 placeholder URLs with gatethres values. Pronunciation 'GATE-thress' surfaced in README + brief + runbook per spec §7 acceptance."
  ```

- [ ] **Step 8: Merge**

---

## Task 7: GitHub repo rename + workflow re-point

> **Owner:** Vinei. External admin (GitHub) + local git remote update. Blocks Task 9 (prod smoke needs the workflow targeting prod).

- [ ] **Step 1: Rename repo on GitHub**

  Visit `github.com/<your-username>/eventgate` → Settings → General → Repository name → change to `gatethres` → Rename.

  GitHub keeps redirects on both old and new URLs.

- [ ] **Step 2: Update local git remote**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git remote set-url origin git@github.com:<your-username>/gatethres.git
  git remote -v  # verify
  ```

- [ ] **Step 3: Rename local working directory (optional)**

  ```bash
  cd ..
  mv eventgate gatethres
  cd gatethres
  ```

  Update any local shell aliases, IDE workspace files, or `claudecode` configs pointing at the old path.

- [ ] **Step 4: Update any references in CLAUDE.md / memory files**

  Memory was updated in spec-writing phase. Verify:
  ```bash
  grep -ri 'eventgate' /Users/vinei/.claude/projects/-Users-vinei-Projects-eventgate/memory/ || echo "clean"
  ```

  Note: the memory directory path itself contains "eventgate" — Claude's project key is derived from the path. If we renamed the directory in Step 3, the memory dir path may need to be aliased or the project re-keyed. Not pilot-blocking; flag for post-pilot cleanup.

- [ ] **Step 5: Verify CI green on the new repo name**

  Push a no-op commit:
  ```bash
  git commit --allow-empty -m "chore(plan-h): verify CI on renamed repo"
  git push
  gh run watch
  ```

  Expected: deploy-backend workflow runs against `gatethres-backend`, lands green.

- [ ] **Step 6: Notify any collaborators**

  If anyone else has the repo cloned (per spec §4.2 risk), send a short Telegram DM with the new clone URL.

---

## Task 8: Khmer brand-bearing strings (Vatana review)

> **Owner:** Vinei coordinates with Vatana. Translation work happens outside this repo; we apply the result. Can run in parallel with Task 7.

**Files:**
- Modify: `frontend/lib/i18n/messages/km.json` — strings that contain "Eventgate" or refer to the brand
- (Also coordinated: Resend email templates, Telegram bot replies if any contain brand strings — most likely in `backend/apps/notifications/telegram_*` and `backend/apps/guests/tasks.py`)

- [ ] **Step 1: Identify Khmer strings touching the brand**

  ```bash
  grep -E 'Eventgate|eventgate' frontend/lib/i18n/messages/km.json
  ```

  Expected: a small set of keys (login screen, PWA install banner, possibly email previews).

- [ ] **Step 2: Build Vatana's review packet**

  Send Vatana (via Telegram DM or whatever channel per runbook §2):
  - The list of English strings + their current Khmer translations
  - The brand transliteration question: "How should we render 'Gatethres' (pronounced GATE-thress) in Khmer?"
  - Context: this is the product brand name (was Eventgate)

- [ ] **Step 3: Wait for Vatana's response**

  Expected turnaround: <48h based on her prior responsiveness. If she takes longer, the pilot can still launch with English-only brand strings (Khmer transliteration of a coined word is non-blocking — guests will still recognize the brand visually).

- [ ] **Step 4: Apply Vatana's translations**

  Edit `frontend/lib/i18n/messages/km.json` with the new Khmer strings. Run prettier:
  ```bash
  cd frontend && pnpm format
  ```

- [ ] **Step 5: Local smoke — Khmer language toggle**

  ```bash
  pnpm dev
  ```
  Open `http://localhost:3000`. Toggle to Khmer (ខ្មែរ). Verify the brand-bearing strings render with Vatana's translations.

- [ ] **Step 6: Open PR + merge**

  ```bash
  git checkout -b plan-h/wave-8-khmer-brand
  git add frontend/lib/i18n/messages/km.json
  git commit -m "i18n(plan-h): wave 8 — Khmer brand-bearing strings updated for Gatethres (Vatana review)"
  git push -u origin plan-h/wave-8-khmer-brand
  gh pr create --title "i18n(plan-h): wave 8 — Khmer Gatethres brand strings"
  gh pr merge --squash
  ```

---

## Task 9: Prod env smoke against Plan F + Plan G checklists

> **Owner:** Vinei. No source changes. Pilot-readiness gate. Spins up throwaway test data and runs the existing verification checklists against prod.

**Files (read-only references):**
- `docs/plans/2026-05-21-plan-f-verification-checklist.md`
- `docs/plans/2026-05-22-plan-g-verification-checklist.md`
- `docs/plans/2026-05-22-plan-f-cross-device-reverification.md`

- [ ] **Step 1: Create a throwaway prod test org + event**

  Via the dashboard at `https://gatethres.com`:
  - Sign in (magic-link to your email)
  - Create org: `gatethres-acceptance` (slug `gatethres-acceptance`)
  - Create event: `Plan H Smoke` (slug `plan-h-smoke`), date = today + 1, capacity = 10
  - Set PIN, generate device enrollment codes

- [ ] **Step 2: Run Plan F verification checklist §§0–9**

  Per runbook §1.5 — work through `docs/plans/2026-05-21-plan-f-verification-checklist.md` step by step on prod. Use the throwaway event for any test data.

- [ ] **Step 3: Run Plan G §4 regression smoke**

  Per runbook §1.5 — work through `docs/plans/2026-05-22-plan-g-verification-checklist.md` Section 4.

- [ ] **Step 4: Run cross-device re-verification Flows 1 + 2**

  Per `docs/plans/2026-05-22-plan-f-cross-device-reverification.md` — two devices, offline-conflict + walk-in lifecycle flows.

- [ ] **Step 5: Document any failures**

  If anything fails: file in `docs/plans/improvement-and-findings-logs.md` as a Plan H smoke finding. P1 failures block pilot launch; P2/P3 get triaged.

- [ ] **Step 6: Archive / delete the throwaway test event**

  Dashboard → `gatethres-acceptance` org → events → `Plan H Smoke` → Archive. (Or delete if the data model supports it.)

- [ ] **Step 7: Commit findings (if any)**

  ```bash
  git add docs/plans/improvement-and-findings-logs.md
  git commit -m "docs(plan-h): wave 9 — prod env smoke findings"
  ```

  Or if all checks passed:
  ```bash
  git commit --allow-empty -m "chore(plan-h): wave 9 — prod env smoke passed, Plan F + Plan G checklists green"
  ```

---

## Task 10: Closeout — runbook flip + Plan H done

> **Owner:** Vinei. Final docs commit. Marks Plan H as complete.

**Files:**
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md` (§intro brand row: confirm ✅; verify §1.4 all URLs landed)
- Modify: `docs/plans/improvement-and-findings-logs.md` (append Plan H summary)
- Modify: `docs/plans/2026-05-24-plan-h-execution.md` (this file — fill in §Closeout summary)

- [ ] **Step 1: Grep runbook for stale staging URLs**

  ```bash
  grep -nE 'eventgate-backend-staging|frontend-five-lovat-94' docs/plans/2026-05-23-pilot-launch-runbook.md
  ```

  Each hit should be deliberate (historical context). Anything that looks like a forgotten staging URL in a pilot-facing context → fix.

- [ ] **Step 2: Confirm pronunciation note appears in README + brief + runbook**

  ```bash
  grep -E 'GATE-thress|GATE-?thress' README.md docs/brief.md docs/plans/2026-05-23-pilot-launch-runbook.md
  ```

  Expected: at least one match per file.

- [ ] **Step 3: Append Plan H closeout to improvement log**

  Edit `docs/plans/improvement-and-findings-logs.md` — add a section:
  ```markdown
  ## Plan H — brand rename + prod env split (2026-05-24)

  - Brand picked: **Gatethres** (pronounced GATE-thress). 9-round candidate search → see [spec](./2026-05-24-plan-h-brand-rename-and-prod-split.md) Appendix A.
  - Prod env provisioned: Fly `gatethres-backend` + Vercel `gatethres-app` + Neon prod branch + Upstash + Sentry + Resend `mail.gatethres.com` + Tigris `gatethres-backend-media`.
  - Domain: `gatethres.com` + `api.gatethres.com`.
  - Telegram bot: `@gatethres_bot`.
  - GitHub repo: renamed `eventgate` → `gatethres`.
  - Khmer transliteration confirmed with Vatana: `_____` (fill in).
  - Plan F + Plan G regression smoke against prod: PASSED.
  - Outstanding (deferred to post-pilot): defensive TLD claim (.app, .io, .dev, etc.); custom domain identity work; marketing site.
  ```

- [ ] **Step 4: Fill in §Closeout sign-off section below**

- [ ] **Step 5: Commit**

  ```bash
  git add docs/plans/2026-05-23-pilot-launch-runbook.md docs/plans/improvement-and-findings-logs.md docs/plans/2026-05-24-plan-h-execution.md
  git commit -m "docs(plan-h): wave 10 — closeout; Plan H done"
  ```

- [ ] **Step 6: Mark Plan H done**

  Update task tracker. Plan H is now complete. The first pilot (The Click Cam, 2026-06-05) runs on prod.

### §Closeout sign-off

> Fill in upon completion.

- **Signed-off by:** Vinei
- **Date:** 2026-05-??
- **All waves green:** ☐ yes / ☐ partial (list outstanding)
- **Pilot-ready URL:** `https://gatethres.com`
- **Pilot-ready API:** `https://api.gatethres.com`
- **First-pilot event scheduled on prod:** ☐ yes — The Click Cam event slug: `_____`

---

## Appendix A — Wave dependency graph

```
Task 0 (TM check)
  └─→ Task 1 (domain + handles)
        └─→ Task 2 (prod infra — sub-tasks 2a–2g can parallelize)
              └─→ Task 3 (DNS + SSL)
                    ├─→ Task 4 (Telegram bot)
                    └─→ Task 5 (repo internal rename — biggest PR)
                          └─→ Task 7 (GitHub repo rename + workflow re-point)
                                └─→ Task 9 (prod env smoke — final pilot-readiness gate)
                                      └─→ Task 10 (closeout)

Parallelizable any time after Task 1:
  - Task 6 (docs rename) — runs on its own branch
  - Task 8 (Khmer i18n) — depends on Vatana's response, not on other tasks
```

## Appendix B — Rollback note per wave

- Tasks 0–1: no rollback needed (read-only / external registrations are sunk costs, cheap).
- Task 2: rollback = `flyctl apps destroy gatethres-backend` + delete Vercel/Neon/Upstash/Sentry/Resend/Tigris resources. Reversible (§spec 4.3).
- Task 3: rollback = remove DNS records in Cloudflare. Cert auto-expires.
- Task 4: rollback = BotFather rename back to `@eventgate_bot`; re-run `setup_telegram_webhook` against staging.
- Task 5: rollback = `git revert` the merge commit. **Note:** cookie rename merge is one-way for any user logged in during the deploy window — they'll need to re-login. Reversibility is at the code level, not the session level.
- Task 6: rollback = `git revert`.
- Task 7: rollback = GitHub Settings → Rename back. Local `git remote set-url` back.
- Task 8: rollback = `git revert`.
- Task 9: no rollback — smoke is read + observe.
- Task 10: rollback = `git revert`.
