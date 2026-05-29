# Plan J Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the active codebase from `gatethres` → `eventgate`, migrate to `eventgate.byondr.co` (frontend) + `api.eventgate.byondr.co` (backend), provision a real prod Fly app + Neon prod branch + Upstash + Sentry + Tigris, and mirror staging URLs at `eventgate-staging.byondr.co` / `api.eventgate-staging.byondr.co` — all before the slipped pilot window opens 2026-06-19.

**Architecture:** Plan J runs in 10 waves (0–9). Even waves are agent-side (code rename, Fly config, smoke, docs); odd waves are user-side (cloud account provisioning, GitHub repo transfer, DNS record paste). User-side waves are short checklists in this plan — when the impl agent reaches one, it stops, surfaces the checklist to the dispatcher, and waits for confirmation that user-side work is done before resuming. Agent-side waves land in 3 PRs total: PR #1 = rename, PR #2 = Fly/staging config, PR #3 = docs+memory closeout.

**Tech Stack:** Django 5 + DRF + Celery + Redis + Postgres + Telegram bot SDK on Fly (Singapore); Next.js 15 App Router + TanStack Query + shadcn-ui on Vercel; Resend for email; Tigris (S3-compatible) for media; Sentry for errors; uv + pnpm + GitHub Actions.

**Spec:** [`docs/plans/2026-05-29-plan-j-byondr-umbrella-rename.md`](2026-05-29-plan-j-byondr-umbrella-rename.md) — committed `54d26de` on `feature/plan-j-byondr-rename`.

---

## Pre-flight (run once at the start of execution)

- [ ] **Step 0.1 — Verify worktree on `feature/plan-j-byondr-rename`.**

  ```bash
  git branch --show-current
  ```
  Expected: `feature/plan-j-byondr-rename`

  ```bash
  git log --oneline -2
  ```
  Expected (newest first): `docs(plans): plan J spec — lock Neon prod region to Singapore`, `docs(plans): plan J — byondr umbrella rename + prod env split design`

- [ ] **Step 0.2 — Install deps.**

  ```bash
  cd frontend && pnpm install --frozen-lockfile
  ```
  Expected: "Done in Xs".

  ```bash
  cd backend && uv sync --frozen
  ```
  Expected: no errors.

  Return to worktree root before continuing.

---

## Wave 1 — Plan docs (this PR's existing commits) — ✅ done

This wave is already done. Spec at `docs/plans/2026-05-29-plan-j-byondr-umbrella-rename.md` (commit `54d26de`); impl plan at `docs/plans/2026-05-29-plan-j-implementation.md` (the file you're reading now — gets committed at end of pre-flight).

- [ ] **Step 1.1 — Stage + commit this impl plan.**

  ```bash
  git add docs/plans/2026-05-29-plan-j-implementation.md
  git commit -m "docs(plans): plan J implementation plan"
  ```

---

## Wave 2 — User provisioning (STOP for user)

**STOP. The impl agent must surface this checklist to the dispatcher and wait for explicit "Wave 2 done, resume" confirmation.** None of these can be automated from inside the agent's worktree.

- [ ] **2.1 — Create `byondr-co` GitHub org.** github.com/organizations/new → org name `byondr` → free tier. Note: do not transfer the repo yet (Wave 4).
- [ ] **2.2 — Create new Fly app skeleton.** `flyctl apps create eventgate-backend-prod --org personal`. Don't deploy yet — secrets land in Wave 6.
- [ ] **2.3 — Create new Tigris bucket.** `flyctl storage create --app eventgate-backend-prod`. Capture the injected `AWS_*` + `BUCKET_NAME` Fly secrets (Fly auto-injects them on the new app).
- [ ] **2.4 — Create new Neon prod branch.** Neon dashboard → `eventgate` project (or whatever your existing project is called) → Branches → New branch → name `prod` → region Singapore. Capture the new `DATABASE_URL`.
- [ ] **2.5 — Create new Upstash prod Redis.** Upstash dashboard → New Database → region `ap-southeast-1` (Singapore) → name `eventgate-prod`. Capture `REDIS_URL`.
- [ ] **2.6 — Create new Sentry prod project.** Sentry dashboard → personal-org → New Project → Django → name `eventgate-prod`. Capture the new DSN. Mute audit-trigger-blocked-write test exception pre-emptively (project Settings → Filters & Sampling → custom filter).
- [ ] **2.7 — Confirm `@eventgate_bot` is still under your BotFather account.** Open chat with @BotFather → /mybots → confirm `@eventgate_bot` appears in the list. Capture the bot token (BotFather → bot → API Token → "Revoke current token" to rotate, then copy the new token). The token rotation is intentional — the old token may be stale from Plan H, and we want a fresh one.

When all 7 items are done, paste the captured credentials back to the dispatcher (DATABASE_URL, REDIS_URL, SENTRY_DSN, TELEGRAM_BOT_TOKEN, and confirm Tigris secrets auto-injected). The impl agent uses them in Wave 6.

---

## Wave 3 — Internal code rename (agent)

Rename `gatethres` → `eventgate` across all active code/config. Historical plan docs (Plan A-I, Plan H execution, runbook prior versions) stay as-is — they're the audit trail.

**Surface inventory:**

| Category | Files |
|---|---|
| Backend config | `backend/config/celery.py`, `backend/config/settings/base.py`, `backend/config/settings/test.py`, `backend/pyproject.toml`, `backend/fly.prod.toml` |
| Backend code | `backend/apps/accounts/tasks.py`, `backend/apps/accounts/models.py`, `backend/apps/accounts/management/commands/dev_login.py`, `backend/apps/events/management/commands/seed_dev_event.py`, `backend/apps/guests/tasks.py`, `backend/apps/orgs/services.py` |
| Backend tests | `backend/tests/test_qr_email_task.py`, `backend/tests/test_healthcheck.py` |
| Frontend code | `frontend/app/layout.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/scanner/layout.tsx`, `frontend/app/manifest.ts`, `frontend/sw-src/sw.ts`, `frontend/proxy.ts`, `frontend/components/auth/login-form.tsx`, `frontend/lib/scanner/session.ts` |
| Workflows | `.github/workflows/deploy-backend-prod.yml` |
| Docs | `README.md` (Wave 9 handles brief + runbook) |

### Task 3.1 — Backend settings + Celery + pyproject

**Files:**
- Modify: `backend/config/celery.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/settings/test.py`
- Modify: `backend/pyproject.toml`

- [ ] **Step 3.1.1 — Update Celery app name.**

  In `backend/config/celery.py` line ~9:
  ```python
  # before
  app = Celery("gatethres")
  # after
  app = Celery("eventgate")
  ```

- [ ] **Step 3.1.2 — Update Django settings strings in `base.py`.**

  Find every `gatethres`/`Gatethres` token. Specifically:
  - Line ~89: `default="postgres://gatethres:gatethres@localhost:5432/gatethres"` → `default="postgres://eventgate:eventgate@localhost:5432/eventgate"`
  - Line ~109: `"TITLE": "Gatethres API"` → `"TITLE": "Eventgate API"`
  - Line ~155: `default="Gatethres <noreply@gatethres.com>"` → `default="Eventgate <noreply@mail.byondr.co>"`
  - Line ~172: `JWT_ACCESS_COOKIE = "gatethres_access"` → `JWT_ACCESS_COOKIE = "eventgate_access"`
  - Line ~173: `JWT_REFRESH_COOKIE = "gatethres_refresh"` → `JWT_REFRESH_COOKIE = "eventgate_refresh"`

  Confirm by running:
  ```bash
  grep -n "gatethres\|Gatethres" backend/config/settings/base.py
  ```
  Expected: no output.

- [ ] **Step 3.1.3 — Update test.py if any references remain.**

  ```bash
  grep -n "gatethres\|Gatethres" backend/config/settings/test.py
  ```
  Replace any matches with `eventgate` / `Eventgate`. Most likely none (test.py was updated in Plan H hotfix).

- [ ] **Step 3.1.4 — Update pyproject.toml metadata.**

  In `backend/pyproject.toml`:
  - Line 2: `name = "gatethres-backend"` → `name = "eventgate-backend"`
  - Line 4: `description = "Gatethres — fast, paperless event entrance for Southeast Asia"` → `description = "Eventgate — fast, paperless event entrance for Southeast Asia"`

- [ ] **Step 3.1.5 — Verify settings + tests load.**

  ```bash
  cd backend && uv run python -c "from config.settings import base; print(base.JWT_ACCESS_COOKIE)"
  ```
  Expected: `eventgate_access`

  ```bash
  cd backend && DJANGO_SETTINGS_MODULE=config.settings.test uv run python -c "import django; django.setup(); print('OK')"
  ```
  Expected: `OK`

### Task 3.2 — Backend code references

**Files (each has 1–3 occurrences of `gatethres`/`Gatethres`):**
- Modify: `backend/apps/orgs/services.py`
- Modify: `backend/apps/accounts/tasks.py`
- Modify: `backend/apps/accounts/models.py`
- Modify: `backend/apps/accounts/management/commands/dev_login.py`
- Modify: `backend/apps/events/management/commands/seed_dev_event.py`
- Modify: `backend/apps/guests/tasks.py`

- [ ] **Step 3.2.1 — Inspect each file for context-appropriate replacements.**

  ```bash
  cd backend && grep -n "gatethres\|Gatethres" apps/orgs/services.py apps/accounts/tasks.py apps/accounts/models.py apps/accounts/management/commands/dev_login.py apps/events/management/commands/seed_dev_event.py apps/guests/tasks.py
  ```

  Replace each:
  - `gatethres` → `eventgate` (lowercase contexts: emails, slugs, ids, defaults)
  - `Gatethres` → `Eventgate` (capitalized contexts: brand strings, display names, email subjects)

  Read each match in context before replacing — most are display strings in email templates or default values for dev fixtures.

- [ ] **Step 3.2.2 — Verify zero residual occurrences in backend code (excluding tests + plan docs).**

  ```bash
  grep -rln "gatethres\|Gatethres" backend/ --include="*.py" | grep -v "tests/"
  ```
  Expected: empty.

### Task 3.3 — Backend tests update

**Files:**
- Modify: `backend/tests/test_qr_email_task.py` (3 references)
- Modify: `backend/tests/test_healthcheck.py` (1 reference)

These tests assert on brand-bearing strings in email templates / health check output. Updating them to `Eventgate` keeps them passing.

- [ ] **Step 3.3.1 — Update test_qr_email_task.py.**

  ```bash
  cd backend && grep -n "gatethres\|Gatethres" tests/test_qr_email_task.py
  ```

  Replace each `Gatethres` → `Eventgate` and `gatethres` → `eventgate` per context.

- [ ] **Step 3.3.2 — Update test_healthcheck.py.**

  Same pattern.

- [ ] **Step 3.3.3 — Run the full backend test suite.**

  ```bash
  cd backend && uv run pytest -x
  ```
  Expected: all tests pass (~283+ tests).

  If any tests fail, the most likely cause is an unchanged `gatethres` string in a test fixture or assertion. Find it with:
  ```bash
  cd backend && uv run pytest -x 2>&1 | grep -i "gatethres"
  ```
  Fix the matching test, re-run.

- [ ] **Step 3.3.4 — Run backend mypy + ruff gates.**

  ```bash
  cd backend && uv run mypy apps config
  ```
  Expected: `Success: no issues found in 147+ source files`.

  ```bash
  cd backend && uv run ruff check apps config && uv run ruff format --check apps config
  ```
  Expected: `All checks passed!` and `117 files already formatted`.

### Task 3.4 — Frontend brand strings + cookie + SW cache + manifest

**Files:**
- Modify: `frontend/app/layout.tsx` (line ~20: `title: "Gatethres"` → `"Eventgate"`)
- Modify: `frontend/app/(app)/layout.tsx` (Plan H wave 5: brand title in header, likely `"Gatethres"` in display text)
- Modify: `frontend/app/scanner/layout.tsx` (Plan H wave 5: brand string)
- Modify: `frontend/app/manifest.ts` (3 references: `name`, `short_name`, `description`)
- Modify: `frontend/sw-src/sw.ts` (3 references: 2 cache keys + 1 comment)
- Modify: `frontend/proxy.ts` (cookie name)
- Modify: `frontend/components/auth/login-form.tsx` (brand string)
- Modify: `frontend/lib/scanner/session.ts` (probably a constant)

- [ ] **Step 3.4.1 — Update `frontend/app/layout.tsx`.**

  Line ~20:
  ```tsx
  // before
  title: "Gatethres",
  // after
  title: "Eventgate",
  ```

- [ ] **Step 3.4.2 — Update `frontend/app/(app)/layout.tsx`.**

  ```bash
  grep -n "Gatethres\|gatethres" frontend/app/\(app\)/layout.tsx
  ```
  Replace each `Gatethres` → `Eventgate` (this is the dashboard header brand row).

- [ ] **Step 3.4.3 — Update `frontend/app/scanner/layout.tsx`.**

  Same pattern.

- [ ] **Step 3.4.4 — Update `frontend/app/manifest.ts`.**

  ```ts
  // before
  name: "Gatethres Scanner",
  short_name: "Gatethres",
  description: "Door-day check-in for Gatethres events",
  // after
  name: "Eventgate Scanner",
  short_name: "Eventgate",
  description: "Door-day check-in for Eventgate events",
  ```

- [ ] **Step 3.4.5 — Update `frontend/sw-src/sw.ts` — cache keys (bump v2 → v3 to force PWA invalidation).**

  ```ts
  // before
  new CacheFirst({ cacheName: "gatethres-shell-v2" }),
  // after
  new CacheFirst({ cacheName: "eventgate-shell-v3" }),
  ```

  ```ts
  // before
  cacheName: "gatethres-next-static-v2",
  // after
  cacheName: "eventgate-next-static-v3",
  ```

  Also update the file's top-of-file comment (line ~2) from `Gatethres scanner` → `Eventgate scanner`.

- [ ] **Step 3.4.6 — Update `frontend/proxy.ts` — cookie name.**

  Line ~17:
  ```ts
  // before
  const hasAccess = req.cookies.get("gatethres_access");
  // after
  const hasAccess = req.cookies.get("eventgate_access");
  ```

- [ ] **Step 3.4.7 — Update `frontend/components/auth/login-form.tsx` and `frontend/lib/scanner/session.ts`.**

  ```bash
  grep -n "gatethres\|Gatethres" frontend/components/auth/login-form.tsx frontend/lib/scanner/session.ts
  ```
  Replace per context.

- [ ] **Step 3.4.8 — Verify zero residual occurrences in active frontend code.**

  ```bash
  grep -rln "gatethres\|Gatethres" frontend/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next
  ```
  Expected: empty.

### Task 3.5 — Update `fly.prod.toml` + prod deploy workflow

**Files:**
- Modify: `backend/fly.prod.toml`
- Modify: `.github/workflows/deploy-backend-prod.yml`

- [ ] **Step 3.5.1 — Rewrite `backend/fly.prod.toml`.**

  Replace `gatethres-backend` → `eventgate-backend-prod` in the file:
  ```bash
  cd backend && grep -n "gatethres" fly.prod.toml
  ```
  Update line 1 comment, the `--app` references in the comment block (lines 9, 13, 14, 15), and the `app = "gatethres-backend"` line (line 17). All become `eventgate-backend-prod`. Also update the comment text "Plan I §6.4" → "Plan J §4.5" (the secret list is now in Plan J).

- [ ] **Step 3.5.2 — Rewrite `.github/workflows/deploy-backend-prod.yml`.**

  ```bash
  grep -n "gatethres" .github/workflows/deploy-backend-prod.yml
  ```
  Replace every `gatethres-backend` → `eventgate-backend-prod`. Comment block references to "Plan I" → "Plan J".

### Task 3.6 — Verify zero residual + run full frontend gates

- [ ] **Step 3.6.1 — Repo-wide residual check.**

  ```bash
  grep -rln "gatethres\|Gatethres\|GATETHRES" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.toml" --include="*.json" --include="*.yml" backend/ frontend/ .github/ 2>/dev/null | grep -v node_modules | grep -v .next | grep -v __pycache__
  ```
  Expected: empty.

- [ ] **Step 3.6.2 — Run all frontend gates.**

  ```bash
  cd frontend && pnpm lint
  cd frontend && pnpm format:check
  cd frontend && pnpm exec tsc --noEmit
  cd frontend && pnpm test
  ```
  Expected: all 4 pass.

  If `format:check` fails, run `cd frontend && pnpm prettier --write <modified files>` then re-check.

- [ ] **Step 3.6.3 — Backend gates again (full).**

  ```bash
  cd backend && uv run pytest -x
  cd backend && uv run mypy apps config
  cd backend && uv run ruff check apps config
  cd backend && uv run ruff format --check apps config
  ```
  Expected: all 4 pass.

### Task 3.7 — Commit + push + open PR #1

- [ ] **Step 3.7.1 — Stage everything.**

  ```bash
  git add backend/ frontend/ .github/workflows/deploy-backend-prod.yml
  git status
  ```
  Inspect: all modified files should be the rename targets above. No accidentally-staged files.

- [ ] **Step 3.7.2 — Commit.**

  ```bash
  git commit -m "feat(brand): rename gatethres → eventgate (Plan J Wave 3)"
  ```

  Pre-commit hooks (ruff, prettier, eslint, backend-mypy) will run. If any fail, fix + re-stage + re-commit (NEW commit, not `--amend`).

- [ ] **Step 3.7.3 — Update README.md brand row.**

  ```bash
  grep -n "Gatethres\|gatethres" README.md
  ```
  Replace per context. README likely has a brand title, a "Why" section reference to the brand, and possibly a Khmer transliteration line. Update the Khmer from `ហ្គេតថ្រេស` to `អ៊ីវ៉ិនហ្គេត`.

- [ ] **Step 3.7.4 — Commit README update separately.**

  ```bash
  git add README.md
  git commit -m "docs(readme): rename brand strings + Khmer transliteration to Eventgate"
  ```

- [ ] **Step 3.7.5 — Push branch + open PR #1.**

  ```bash
  git push -u origin feature/plan-j-byondr-rename
  ```

  Then:
  ```bash
  gh auth switch --hostname github.com --user vineidev
  gh -R vineidev/gatethres pr create \
    --head feature/plan-j-byondr-rename \
    --base main \
    --title "Plan J Wave 3 — internal rename: gatethres → eventgate + byondr umbrella" \
    --body "$(cat <<'EOF'
  ## Summary

  Plan J Wave 3: internal code rename from \`gatethres\` to \`eventgate\` across all active files (cookie, SW cache v2→v3, Celery name, pyproject, brand strings, manifest, prod Fly config, prod deploy workflow). README updated with Khmer transliteration \`អ៊ីវ៉ិនហ្គេត\`.

  Spec: \`docs/plans/2026-05-29-plan-j-byondr-umbrella-rename.md\`
  Plan: \`docs/plans/2026-05-29-plan-j-implementation.md\`

  ### Out of scope (later waves)

  - Wave 4: GitHub repo transfer to byondr-co/eventgate (your hands)
  - Wave 5: DNS records at GoDaddy (your hands)
  - Wave 6: Provisioning + first deploy of eventgate-backend-prod Fly app
  - Wave 7: Vercel prod project + staging domain attach
  - Wave 8: Smoke
  - Wave 9: Docs sweep + memory + handoff

  ### Test plan

  - [ ] CI green (pytest, mypy, ruff×2, lint, prettier, tsc, vitest)
  - [ ] Manual: dashboard still loads on \`https://frontend-five-lovat-94.vercel.app\` (cookie rename will log you out — that's expected and part of the rename)
  EOF
  )"
  ```

- [ ] **Step 3.7.6 — Report PR URL to dispatcher.**

  After CI passes, dispatcher merges (rebase, matching #6 + #7 + #9 pattern). PR #1 of Plan J shipped.

---

## Wave 4 — Repo transfer + Telegram bot (STOP for user)

**STOP. Surface this checklist; wait for "Wave 4 done, resume" before Wave 6.**

- [ ] **4.1 — Transfer repo to `byondr-co/eventgate`.** github.com/vineidev/gatethres → Settings → bottom → Transfer ownership → org `byondr-co`, new repo name `eventgate`. GitHub keeps redirects from the old URL.
- [ ] **4.2 — Update local git remote.** From the worktree root:
  ```bash
  git remote set-url origin git@github.com:byondr-co/eventgate.git
  git fetch origin --quiet
  ```
- [ ] **4.3 — Re-create the Vercel staging project link.** Vercel dashboard → existing `frontend-five-lovat-94` project → Settings → Git → re-connect to `byondr-co/eventgate` (transfer broke the connection).
- [ ] **4.4 — Token rotation done?** You should have a fresh `@eventgate_bot` token from Wave 2 step 2.7. Hold onto it for Wave 6.

When done, paste back: confirmed new repo URL + Vercel re-connect + bot token in hand.

---

## Wave 5 — DNS records at GoDaddy (STOP for user)

**STOP. Surface this checklist; wait for "Wave 5 done, resume" before Wave 7 Vercel attach.**

Paste these 4 CNAME records in the byondr.co zone at GoDaddy DNS (Resend records are already added 2026-05-29):

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `eventgate` | `cname.vercel-dns.com.` | 1 hour |
| `CNAME` | `api.eventgate` | `eventgate-backend-prod.fly.dev.` | 1 hour |
| `CNAME` | `eventgate-staging` | `cname.vercel-dns.com.` | 1 hour |
| `CNAME` | `api.eventgate-staging` | `eventgate-backend-staging.fly.dev.` | 1 hour |

After paste, verify propagation:

```bash
dig +short eventgate.byondr.co
dig +short api.eventgate.byondr.co
dig +short eventgate-staging.byondr.co
dig +short api.eventgate-staging.byondr.co
```

All four should resolve within ~5 min. If any returns empty after 15 min, double-check the record at GoDaddy.

When all four resolve, paste back: "Wave 5 DNS done."

---

## Wave 6 — Fly prod app + secrets + first deploy (agent)

This wave runs after Waves 2, 4, 5 are confirmed. Agent has: new DATABASE_URL, REDIS_URL, SENTRY_DSN, TELEGRAM_BOT_TOKEN, and confirmation Tigris is provisioned.

### Task 6.1 — Set Fly secrets on `eventgate-backend-prod`

- [ ] **Step 6.1.1 — Stage all prod secrets in one batch.**

  Run from worktree root. Replace `<...>` with the captured values from Wave 2:

  ```bash
  flyctl secrets set --app eventgate-backend-prod --stage \
    DATABASE_URL="<from Wave 2.4>" \
    REDIS_URL="<from Wave 2.5>" \
    CELERY_BROKER_URL="<same as REDIS_URL>" \
    CELERY_RESULT_BACKEND="<same as REDIS_URL>" \
    SENTRY_DSN="<from Wave 2.6>" \
    SENTRY_ENVIRONMENT="prod" \
    RESEND_API_KEY="<reuse the value already on staging — flyctl secrets list --app eventgate-backend-staging shows it's deployed; the actual value lives at Resend dashboard if you need to look it up>" \
    RESEND_FROM_EMAIL="noreply@mail.byondr.co" \
    DEFAULT_FROM_EMAIL="Eventgate <noreply@mail.byondr.co>" \
    SECRET_KEY="$(openssl rand -hex 64)" \
    ALLOWED_HOSTS="api.eventgate.byondr.co,eventgate-backend-prod.fly.dev" \
    CSRF_TRUSTED_ORIGINS="https://eventgate.byondr.co,https://api.eventgate.byondr.co" \
    CORS_ALLOWED_ORIGINS="https://eventgate.byondr.co" \
    TELEGRAM_BOT_TOKEN="<from Wave 2.7>" \
    TELEGRAM_BOT_USERNAME="eventgate_bot" \
    TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
    TELEGRAM_WEBHOOK_URL="https://api.eventgate.byondr.co/api/v1/telegram/webhook/" \
    MAGIC_LINK_FRONTEND_URL="https://eventgate.byondr.co" \
    PUBLIC_BASE_URL="https://eventgate.byondr.co" \
    JWT_COOKIE_SECURE="True" \
    JWT_COOKIE_SAMESITE="Lax"
  ```

  Note `--stage` flag: stages secrets without restarting machines. They apply on the next deploy.

  Tigris secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `BUCKET_NAME`) were auto-injected by `flyctl storage create` in Wave 2.3 — don't re-set them.

- [ ] **Step 6.1.2 — Verify secrets staged.**

  ```bash
  flyctl secrets list --app eventgate-backend-prod
  ```
  Expected: 22+ secrets listed (~17 from the batch above + 5 Tigris from auto-inject). All with `Status: Staged` or `Status: Pending`.

### Task 6.2 — First deploy

- [ ] **Step 6.2.1 — Deploy.**

  ```bash
  cd backend && flyctl deploy --config fly.prod.toml --remote-only --app eventgate-backend-prod
  ```

  Watch for the `release_command` log line confirming `migrate --noinput` ran and `setup_telegram_webhook` registered the webhook. Build + deploy typically 2–4 min.

- [ ] **Step 6.2.2 — Verify health.**

  ```bash
  curl -I https://eventgate-backend-prod.fly.dev/api/health/
  ```
  Expected: 200 OK.

- [ ] **Step 6.2.3 — Verify migrations applied.**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py showmigrations | grep -v '\[X\]' | head"
  ```
  Expected: app names only, no unapplied entries. (Per the Plan H gotcha: use `/app/.venv/bin/python`, NOT bare `python`, since Fly SSH doesn't inherit Docker ENV.)

- [ ] **Step 6.2.4 — Verify audit trigger present on prod DB.**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command '/app/.venv/bin/python manage.py shell -c "from django.db import connection; cur = connection.cursor(); cur.execute(\"SELECT tgname FROM pg_trigger WHERE tgname='\''audit_auditevent_append_only'\''\"); print('\''trigger present:'\'', bool(cur.fetchone()))"'
  ```
  Expected: `trigger present: True`.

### Task 6.3 — Add Fly cert for `api.eventgate.byondr.co`

- [ ] **Step 6.3.1 — Trigger cert issuance.**

  ```bash
  flyctl certs add api.eventgate.byondr.co --app eventgate-backend-prod
  ```
  Expected: Fly enqueues cert provisioning. Wait ~30s.

- [ ] **Step 6.3.2 — Verify cert active.**

  ```bash
  flyctl certs show api.eventgate.byondr.co --app eventgate-backend-prod
  ```
  Expected: `Status: configured` AND `Issued: ...` (filled in).

- [ ] **Step 6.3.3 — End-to-end check.**

  ```bash
  curl -I https://api.eventgate.byondr.co/api/health/
  ```
  Expected: 200 OK with `Server: Fly`.

### Task 6.4 — Update staging Fly secrets (URL mirror)

- [ ] **Step 6.4.1 — Add staging mirror URLs to ALLOWED_HOSTS + CSRF.**

  ```bash
  flyctl secrets set --app eventgate-backend-staging \
    ALLOWED_HOSTS="api.eventgate-staging.byondr.co,eventgate-backend-staging.fly.dev" \
    CSRF_TRUSTED_ORIGINS="https://eventgate-staging.byondr.co,https://api.eventgate-staging.byondr.co,https://frontend-five-lovat-94.vercel.app"
  ```

  `--stage` not used; staging Fly will roll-restart, which is fine — staging isn't pilot-facing.

- [ ] **Step 6.4.2 — Verify staging still healthy after restart.**

  ```bash
  curl -I https://eventgate-backend-staging.fly.dev/api/health/
  ```
  Expected: 200 OK (after 30–60s).

### Task 6.5 — Add Fly cert for `api.eventgate-staging.byondr.co`

- [ ] **Step 6.5.1 — Cert issuance.**

  ```bash
  flyctl certs add api.eventgate-staging.byondr.co --app eventgate-backend-staging
  ```

- [ ] **Step 6.5.2 — Verify.**

  ```bash
  curl -I https://api.eventgate-staging.byondr.co/api/health/
  ```
  Expected: 200 OK.

### Task 6.6 — Verify Telegram webhook landed on prod

- [ ] **Step 6.6.1 — Read webhook info.**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py shell -c \"import os, urllib.request, json; tok = os.environ['TELEGRAM_BOT_TOKEN']; print(json.dumps(json.loads(urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/getWebhookInfo').read()), indent=2))\""
  ```
  Expected: `"url": "https://api.eventgate.byondr.co/api/v1/telegram/webhook/"`, `"pending_update_count": 0`, no `last_error_message`.

  If webhook URL is wrong or empty, manually re-run:
  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py setup_telegram_webhook"
  ```

### Task 6.7 — Commit Plan I scaffolding refresh (Wave 6 PR)

- [ ] **Step 6.7.1 — Verify the in-repo config changes from Task 3.5 are already committed.**

  ```bash
  git log --oneline main..HEAD -- backend/fly.prod.toml .github/workflows/deploy-backend-prod.yml
  ```
  Expected: shows the Wave 3 commit that touched these files. (No new commit needed unless additional edits in Wave 6 — none expected.)

  All Wave 6 work happens against external state (Fly app, cert provisioning); the only repo changes were in Wave 3. PR #2 isn't strictly needed for code — but we'll open it for the docs sweep in Wave 9.

---

## Wave 7 — Vercel domain attach (user + agent split)

### Task 7.1 — Vercel prod project creation (USER)

**STOP. User does this in the Vercel dashboard; wait for "Wave 7.1 done" before agent runs Task 7.2.**

- [ ] **7.1.1 — New Vercel project.** Vercel dashboard → New Project → Import from GitHub → `byondr-co/eventgate`. Project name `eventgate`. Production branch `main`.
- [ ] **7.1.2 — Set env vars on the new project:**
  - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = `eventgate_bot`
  - Mirror any other `NEXT_PUBLIC_*` vars currently set on the existing staging project (Settings → Environment Variables on `frontend-five-lovat-94`)
- [ ] **7.1.3 — Add custom domain.** Project → Domains → Add `eventgate.byondr.co`. Vercel detects the CNAME from Wave 5 and issues SSL within ~30s.
- [ ] **7.1.4 — Verify.** `curl -I https://eventgate.byondr.co` → 200 OK with Vercel cert.

### Task 7.2 — Staging Vercel domain attach (USER)

- [ ] **7.2.1 — Add `eventgate-staging.byondr.co` to existing `frontend-five-lovat-94` project.** Project → Domains → Add Domain. Vercel auto-attaches.
- [ ] **7.2.2 — Verify.** `curl -I https://eventgate-staging.byondr.co` → 200 OK.

When done, paste back: "Wave 7 done."

---

## Wave 8 — Smoke (agent + user)

Verifies prod is genuinely usable end-to-end. Run after Wave 7 is confirmed.

### Task 8.1 — Resend deliverability test (non-owner address)

- [ ] **Step 8.1.1 — Send a test email to a non-owner address.**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py shell -c \"from django.core.mail import send_mail; r = send_mail('Eventgate prod deliverability test', 'If you see this, mail.byondr.co + Resend wiring on prod works.', None, ['vinei.ro@squeeze-inc.co.jp'], fail_silently=False); print('result:', r)\""
  ```
  Expected: `result: 1` (Resend accepted). Verify the email arrives at `vinei.ro@squeeze-inc.co.jp` within 30s, with FROM `"Eventgate <noreply@mail.byondr.co>"`.

  If Resend returns 403, the domain isn't fully verified yet. Check Resend dashboard.

### Task 8.2 — Sentry test event

- [ ] **Step 8.2.1 — Capture a deliberate Sentry message from prod.**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py shell -c \"import sentry_sdk; eid = sentry_sdk.capture_message('Plan J Wave 8 smoke — deliberate test event from prod', level='warning'); print('event_id:', eid); sentry_sdk.flush(timeout=5)\""
  ```
  Expected: prints event_id; verify the event lands in Sentry prod project within 60s, tagged `environment=prod`.

### Task 8.3 — Telegram webhook health

- [ ] **Step 8.3.1 — Re-confirm webhook (sanity check after smoke runs).**

  ```bash
  flyctl ssh console --app eventgate-backend-prod --command "/app/.venv/bin/python manage.py shell -c \"import os, urllib.request, json; tok = os.environ['TELEGRAM_BOT_TOKEN']; print(json.dumps(json.loads(urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/getWebhookInfo').read()), indent=2))\""
  ```
  Expected: `"url": "https://api.eventgate.byondr.co/api/v1/telegram/webhook/"`, no `last_error_message`.

### Task 8.4 — End-to-end registration flow (USER + agent)

- [ ] **Step 8.4.1 — Create a throwaway org + event on prod.**

  Operator opens `https://eventgate.byondr.co/login`, magic-link logs in. Creates an org `acceptance-test`, an event `smoke-test`.

- [ ] **Step 8.4.2 — Public registration.**

  Operator opens `https://eventgate.byondr.co/e/acceptance-test/smoke-test/register` in an incognito window, fills the form with a real deliverable email, submits.

- [ ] **Step 8.4.3 — Verify QR delivered.**

  The submitted email address receives a QR PNG within 30s. FROM `"Eventgate <noreply@mail.byondr.co>"`.

- [ ] **Step 8.4.4 — Scanner flow.**

  Operator opens `https://eventgate.byondr.co/scanner` on a second device, enrolls, scans the QR. Check-in succeeds.

### Task 8.5 — Run all gates one final time

- [ ] **Step 8.5.1 — Backend gates.**

  ```bash
  cd backend && uv run pytest -x && uv run mypy apps config && uv run ruff check apps config && uv run ruff format --check apps config
  ```
  Expected: all pass.

- [ ] **Step 8.5.2 — Frontend gates.**

  ```bash
  cd frontend && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit && pnpm test
  ```
  Expected: all pass.

### Task 8.6 — Clean up throwaway data

- [ ] **Step 8.6.1 — Archive the smoke org/event.**

  Operator navigates to the smoke event and uses the Status card to set status `archived`. The org + event stay in the DB but won't appear in the pilot's view.

  Optional: delete via Django admin if you want a truly clean prod.

---

## Wave 9 — Docs sweep + memory + handoff (agent)

Final pass: update all the operator-facing docs to point at the byondr URLs and the Eventgate brand.

### Task 9.1 — Brief update

**Files:**
- Modify: `docs/brief.md`

- [ ] **Step 9.1.1 — Update §14 row 1 (brand row).**

  ```bash
  grep -n "Gatethres\|gatethres" docs/brief.md
  ```
  Update brand-bearing strings: `Gatethres` → `Eventgate`. Update the Khmer transliteration line from `ហ្គេតថ្រេស` → `អ៊ីវ៉ិនហ្គេត`. Mark Plan J as the rename source.

- [ ] **Step 9.1.2 — Commit.**

  ```bash
  git add docs/brief.md
  git commit -m "docs(brief): rename brand to Eventgate + Khmer អ៊ីវ៉ិនហ្គេត"
  ```

### Task 9.2 — Runbook update

**Files:**
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md`

- [ ] **Step 9.2.1 — Replace brand strings + URL placeholders.**

  ```bash
  grep -n "Gatethres\|gatethres\|frontend-five-lovat-94\|eventgate-backend-staging.fly.dev" docs/plans/2026-05-23-pilot-launch-runbook.md
  ```
  Update each occurrence per context. Specifically:
  - §intro brand row: `Gatethres` → `Eventgate`
  - §1.4 production column: staging URLs → byondr URLs (`https://eventgate.byondr.co`, `https://api.eventgate.byondr.co`)
  - §1.4 staging column: update to byondr staging URLs (`https://eventgate-staging.byondr.co`, `https://api.eventgate-staging.byondr.co`)
  - Khmer pronunciation note: `ហ្គេតថ្រេស` → `អ៊ីវ៉ិនហ្គេត` (and update pronunciation gloss from "GATE-thress" to whatever Eventgate's pronunciation is; ee-vent-gate is standard)
  - Pilot window: `2026-06-05 → 2026-07-03` → `2026-06-19 → 2026-07-17`

- [ ] **Step 9.2.2 — Commit.**

  ```bash
  git add docs/plans/2026-05-23-pilot-launch-runbook.md
  git commit -m "docs(runbook): pilot window slip + byondr URLs + Eventgate brand"
  ```

### Task 9.3 — Improvement log update

**Files:**
- Modify: `docs/plans/improvement-and-findings-logs.md`

- [ ] **Step 9.3.1 — Append a Plan J wrap-up section after the existing Plan H wrap-up.**

  Add a new section at the bottom (before any existing closing matter):
  ```markdown
  ## Plan J — wrap-up summary (2026-05-29)

  **Goal:** Rename `gatethres` → `eventgate`, migrate to `eventgate.byondr.co` + `api.eventgate.byondr.co`, with staging mirror at `eventgate-staging.byondr.co` / `api.eventgate-staging.byondr.co`. Fold in Plan I prod env split (new Fly app `eventgate-backend-prod`, fresh Neon prod branch + Upstash prod + Sentry prod project + Tigris bucket, verified Resend domain `mail.byondr.co` shared across future byondr products).

  **Pilot window (revised):** 2026-06-19 → 2026-07-17 (slipped +2 weeks from original 2026-06-05; Click Cam confirmed).

  **What landed:**
  - Internal code rename (Wave 3) including cookie name, SW cache v2→v3, Celery app name, pyproject, manifest, all brand strings
  - GitHub repo transfer to `byondr-co/eventgate`
  - 4 new GoDaddy DNS records (eventgate, api.eventgate, eventgate-staging, api.eventgate-staging)
  - New Fly app `eventgate-backend-prod` (Singapore) with 22 prod secrets + first deploy + cert
  - Staging mirror Fly secrets diff + cert
  - New Vercel project `eventgate` linked to byondr-co/eventgate
  - Resend domain `mail.byondr.co` verified (Wave 0; pre-Plan-J)
  - Telegram bot `@eventgate_bot` reused with rotated token + repointed webhook
  - Khmer transliteration: `អ៊ីវ៉ិនហ្គេត` (user-provided, no Vatana round-trip needed)
  - Plan I scaffolding (PR #8 dormant files) absorbed + renamed; old gatethres-backend references retired

  **Operational lessons confirmed (no new ones surfaced):**
  - Cookie rename forces re-login — done well before pilot opens
  - SW cache key bump v2→v3 invalidates PWA on next refresh
  - `flyctl secrets set` skips release_command — `setup_telegram_webhook` must run manually after secrets land
  - Fly SSH doesn't inherit Docker ENV — `/app/.venv/bin/python` explicit

  **Plan J status:** ✅ DONE.
  ```

- [ ] **Step 9.3.2 — Commit.**

  ```bash
  git add docs/plans/improvement-and-findings-logs.md
  git commit -m "docs(plans): Plan J wrap-up summary"
  ```

### Task 9.4 — Handoff doc

**Files:**
- Create: `docs/handoff-2026-05-29-plan-j-shipped.md`

- [ ] **Step 9.4.1 — Write handoff capturing the new state.**

  Use the structure of `docs/handoff-2026-05-25-pilot-prep.md` (same date format, same sections). Cover:
  - What shipped (PR #1, PR #2 if any, PR #3 from this wave)
  - Current state: deployed Fly app, Vercel project, DNS, Resend, Sentry — all under byondr URLs
  - Operational gotchas (cumulative, unchanged from previous handoff)
  - Pilot-prep cadence: T-7 = 2026-06-12, T-3 = 2026-06-16, T-1 = 2026-06-18, T-0 = 2026-06-19
  - Open follow-ups (other byondr products, byondr.co landing page, multi-region Neon, etc.)
  - Memory notes

- [ ] **Step 9.4.2 — Commit.**

  ```bash
  git add docs/handoff-2026-05-29-plan-j-shipped.md
  git commit -m "docs: handoff 2026-05-29 — Plan J shipped"
  ```

### Task 9.5 — Memory update

- [ ] **Step 9.5.1 — Update `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/project_brand_pick.md`.**

  Rewrite the memory to reflect Eventgate as the final brand under the byondr umbrella. Remove the "INTERIM" framing from 2026-05-27.

  Suggested new frontmatter:
  ```yaml
  ---
  name: project-brand-pick
  description: Brand = Eventgate under byondr.co umbrella (Plan J 2026-05-29); product URL eventgate.byondr.co; email mail.byondr.co; Khmer អ៊ីវ៉ិនហ្គេត
  metadata:
    node_type: memory
    type: project
    originSessionId: 3b25f165-7e61-4c1d-8b25-870aeed9a145
  ---
  ```

  Body: brief description of the umbrella structure + URL map + Khmer transliteration. Reference the Plan J spec doc.

- [ ] **Step 9.5.2 — Update `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/MEMORY.md` index line.**

  Replace the brand-pick line with one that matches the new description.

- [ ] **Step 9.5.3 — Update `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/project_pilot_window.md`** if it exists, to reflect the +2-week slip (2026-06-19 → 2026-07-17).

  (Memory files don't get committed to the repo — they live in the user's home dir.)

### Task 9.6 — Push final commits + open PR #2 (docs sweep PR)

- [ ] **Step 9.6.1 — Push.**

  ```bash
  git push origin feature/plan-j-byondr-rename
  ```

  Since Wave 6 didn't open a separate PR (no repo changes beyond Wave 3), this push just adds the Wave 9 commits to PR #1's branch IF Plan J branch wasn't merged yet. If PR #1 was already merged in between waves, push to a new branch:

  ```bash
  git checkout -b docs/plan-j-wave-9 origin/main
  git cherry-pick <wave-9-commit-shas>
  git push -u origin docs/plan-j-wave-9
  ```

- [ ] **Step 9.6.2 — Open PR #2 (or amend PR #1 if still open).**

  ```bash
  gh -R byondr-co/eventgate pr create \
    --head <branch-name> \
    --base main \
    --title "Plan J Wave 9 — docs sweep + handoff + memory" \
    --body "Closeout for Plan J. Updates README + brief + runbook + improvement log; new handoff doc; memory updated (out-of-repo)."
  ```

### Task 9.7 — Mark Plan J complete

- [ ] **Step 9.7.1 — Report final state to dispatcher.**

  Print: PR URLs, branch state, smoke results, Plan J status = DONE.

---

## Self-review — completed inline

**Spec coverage check** (against `docs/plans/2026-05-29-plan-j-byondr-umbrella-rename.md`):

| Spec section | Wave / Task |
|---|---|
| §3 pilot window 2026-06-19 → 2026-07-17 | Wave 9 Task 9.2 (runbook update) |
| §3 byondr umbrella + eventgate product | Wave 3 (rename) |
| §3 mail.byondr.co shared | Wave 6 (Fly secrets RESEND_FROM_EMAIL + DEFAULT_FROM_EMAIL); Wave 8.1 (deliverability test) |
| §3 GitHub byondr org | Wave 2.1; Wave 4.1 |
| §3 reuse `@eventgate_bot` | Wave 2.7; Wave 6.6 |
| §4.1 URL mapping | Wave 6 + Wave 7 (DNS + Vercel + Fly certs) |
| §4.2 code-surface rename map | Wave 3 (all subtasks) |
| §4.3 new cloud resources | Wave 2 (full checklist) |
| §4.4 DNS records (4 CNAMEs) | Wave 5 |
| §4.5 Fly prod secrets | Wave 6.1 |
| §4.6 staging Fly secrets diff | Wave 6.4 |
| §4.7 Vercel project config | Wave 7 |
| §5 wave structure | Mapped 1:1 to this plan's waves |
| §6 risk + reversibility | Implicit in commit-per-task discipline + Wave 8 smoke catching issues |
| §7 acceptance criteria | Wave 8 covers all checks |

No spec gaps.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "add appropriate error handling" tokens. Every step has exact commands and expected outputs.

**Type consistency check:**
- `gatethres` → `eventgate` lowercase throughout (DB defaults, slug-like contexts, cookie names) ✓
- `Gatethres` → `Eventgate` capitalized throughout (display strings, brand) ✓
- Cookie names `gatethres_access` / `gatethres_refresh` → `eventgate_access` / `eventgate_refresh` consistent in Task 3.1.2 and Task 3.4.6 ✓
- SW cache keys `gatethres-shell-v2` → `eventgate-shell-v3` and `gatethres-next-static-v2` → `eventgate-next-static-v3` (bump v2→v3) consistent ✓
- Fly app names: `eventgate-backend-prod` (prod, new) vs `eventgate-backend-staging` (staging, unchanged) consistent ✓
- URL pairs: `eventgate.byondr.co` / `api.eventgate.byondr.co` (prod) vs `eventgate-staging.byondr.co` / `api.eventgate-staging.byondr.co` (staging) consistent ✓
- Khmer: `អ៊ីវ៉ិនហ្គេត` consistent in Task 3.7.3 + 9.1.1 + 9.2.1 + 9.5.1 ✓

Plan is internally consistent.
