# Handoff — 2026-06-27 (next-session brief)

## Where we are

**Eventgate v2 uplift program** (post-pilot priority = UX/onboarding, per
`docs/plans/2026-06-11-phase2-candidate-slate.md`). Slice status:

1. ✅ Event Setup Wizard — PR #82
2. ✅ Core CRUD (event edit/delete, guest edit/void/delete) — backend #85, frontend #88
3. ✅ List-scaling (event search/filter/sort/pagination, member pagination/sort, guest sort) — #89
4. ⬜ **Dashboard polish + SSE live data** ← NEXT (requested, not started)
5. ⬜ Remotion event share-video (own spec later)

Also merged this week: env-driven local DB/redis ports (#86), Dockerized full dev
stack "Model B" (#87), guest CSV export + bulk actions (#90), README Redis fix (#91).

`main` HEAD = `8c83202`. **No open PRs.** Everything above is merged to `main`.

## ⚠️ Standing blockers (carry forward)

- **Fly billing block + prod offline.** Fly account `ro-vinei` has overdue
  invoices → prod backend image builds 403 → **none of #85–#91 is deployed to
  prod**. Separately, the prod app machine (`eventgate-backend-prod`,
  `5683e764f11e78`) was **manually stopped** 2026-06-26 to stop Neon prod burning
  compute. So prod is intentionally OFFLINE. To restore: pay billing →
  `gh workflow run deploy-backend-prod.yml` → `flyctl machine start 5683e764f11e78
  --app eventgate-backend-prod`. (See memory `project_fly_billing_block`.)
- **Sender domain** still `onboarding@resend.dev` sandbox — blocks real
  transactional/billing email. Tier-1 revenue blocker, not UX.

## Local dev (Model B, from #87)

- App + worker + beat + frontend run in containers with live reload:
  `docker compose up` (override file mounts source). Host code edits reflect in
  containers (bind mounts + watchers).
- DB/redis host ports are **env-driven** (#86) so multiple projects coexist — set
  per-project ports in `.env`; container-internal ports unchanged. This fixed the
  old hard-coded `localhost:5432` clash with other projects.
- Backend tests still expect Postgres reachable as the test settings dictate
  (`config/settings/test.py`). Use the compose DB; `nvm use 20` for frontend.

## NEXT: brainstorm uplift #4 — Dashboard + SSE live data

**Goal (from slate Tier 3 #10):** replace the dashboard's 5–10s polling with
server-sent live updates, and add gate analytics (throughput / peak-window /
gate-utilization). Business-tier differentiator.

**Current polling to replace/augment (verified 2026-06-27):**
- `backend/apps/events/views_stats.py` — `EventStatsView`, cheap aggregates behind
  a 5s ETag/304 poll (`frontend/lib/event-stats.ts` `refetchInterval: 5_000`).
- Other polls: `lib/audit.ts` 10s, `lib/helpdesk.ts` 5s/30s, `lib/guests.ts`
  count 30s.
- **No SSE anywhere** (no `EventSource` / `text/event-stream`). Greenfield.

**Open design questions for the brainstorm:**
- SSE vs WebSocket vs keep-polling-but-smarter. (Django is WSGI gunicorn +
  Celery; SSE over WSGI needs care — streaming response ties up a worker. Check
  whether ASGI/Daphne is configured — `config/asgi.py` exists but gunicorn WSGI
  is what's deployed per `fly.prod.toml`. This is THE load-bearing architecture
  question.)
- What's actually "live": check-in count, recent check-ins feed, gate throughput?
- New analytics: throughput (check-ins/min), peak window, per-gate utilization —
  new aggregates + a backend source.
- Fallback when SSE unsupported / connection drops (degrade to polling).

**Process:** follow the established rhythm — `superpowers:brainstorming` →
`writing-plans` → `subagent-driven-development`. Spec to
`docs/superpowers/specs/2026-06-27-dashboard-sse-design.md`. Mirror the most recent
specs/plans (`docs/superpowers/specs/2026-06-27-guest-export-bulk-design.md`,
`docs/superpowers/plans/2026-06-27-guest-export-bulk.md`) for format + rigor.

## Project conventions (reminders)

- Commits: Conventional Commits, single-line, **NO `Co-Authored-By` trailer**.
- `gh` needs the `vineidev` account (`gh auth switch --user vineidev`). Repo
  `byondr-co/eventgate`; PRs against `main`.
- Plans/specs live in `docs/superpowers/{specs,plans}/`.
- Frontend is a **modified Next.js** — read `frontend/AGENTS.md` + the bundled
  `node_modules/next/dist/docs/` before writing routing/hook code.
- Audit log is **append-only** (DB trigger); `audit.event`=PROTECT,
  `audit.guest`=SET_NULL. Hard-deletes only when no audit rows (shaped the Core
  CRUD delete model). Relevant if SSE work touches audit.
