# Handoff — 2026-06-27 (next-session brief)

## Where we are

**Eventgate v2 uplift program** (post-pilot priority = UX/onboarding, per
`docs/plans/2026-06-11-phase2-candidate-slate.md`). Slice status:

1. ✅ Event Setup Wizard — PR #82
2. ✅ Core CRUD (event edit/delete, guest edit/void/delete) — backend #85, frontend #88
3. ✅ List-scaling (event search/filter/sort/pagination, member pagination/sort, guest sort) — #89
4. ✅ **Dashboard polish + SSE live data** — implemented on
   `topic/dashboard-sse-live-data`, pending PR/merge
5. ⬜ Remotion event share-video (own spec later)

Also merged this week: env-driven local DB/redis ports (#86), Dockerized full dev
stack "Model B" (#87), guest CSV export + bulk actions (#90), README Redis fix (#91).

Local `origin/main` HEAD = `7bdf98b`. **No open PR for slice #4 yet.** Slices
#1-#3 and #91 are merged to `main`; slice #4 is complete on the feature branch
and not deployed.

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

## Slice #4 complete on branch — Dashboard + SSE live data

**Specs/plans:**
- Spec: `docs/superpowers/specs/2026-06-27-dashboard-sse-design.md`
- Plan: `docs/superpowers/plans/2026-06-27-dashboard-sse.md`

**Architecture decision:** SSE over ASGI, not WebSocket and not smarter polling.
`backend/fly.prod.toml` and `backend/Dockerfile` now run `uvicorn
config.asgi:application` for the web process. This was required because streaming
SSE under WSGI/gunicorn would tie up workers and misrepresent production behavior.

**Backend implemented:**
- New persisted minute metric table: `analytics_eventgateminutemetric`
  (`backend/apps/analytics/`) with counters for `checkins`, `duplicates`,
  `conflicts`, and `escalations`, grouped by event/gate/scanner/minute.
- Stats snapshot builder: `backend/apps/events/live_snapshot.py`; `/stats/` now
  reuses the same snapshot and includes analytics/recent activity while keeping
  ETag compatibility.
- Redis publish helper: `backend/apps/events/live_publish.py`; mutation paths
  publish compact invalidation hints after commit.
- SSE endpoint: `GET /api/v1/orgs/<org>/events/<event>/live/` in
  `backend/apps/events/views_live.py`. It authenticates with the existing
  `eventgate_access` cookie, subscribes to Redis before the initial snapshot,
  emits `snapshot`, `invalidate`, and `heartbeat` frames, emits a fresh snapshot
  after idle heartbeats so rolling analytics decay during quiet periods, and
  sets `X-Accel-Buffering: no`.
- Live signals are wired through check-in/helpdesk, guest CRUD/bulk, public/bridge
  registration, CSV completion, and walk-in display/claim/info paths.

**Frontend implemented:**
- `frontend/lib/event-live.ts` exposes `useEventLive(orgSlug, eventSlug)` with
  connection states `connecting | live | reconnecting | polling`.
- `frontend/lib/event-stats.ts` now includes `EventLiveSnapshot`,
  `EventAnalytics`, throughput, gate utilization, trend, and recent activity
  types. Polling can be disabled by callers.
- Dashboard page calls the live hook only after event metadata exists, shows a
  `LiveStatusBadge`, feeds live snapshots into count tiles, and renders
  throughput, gate utilization, peak-window, and recent activity panels.
- Fallback behavior: after 3 SSE errors, the hook closes the stream, switches to
  polling, and makes polling data authoritative. EventSource/window-unavailable
  browsers also fall back to polling. While SSE is healthy, polling stays off and
  the server refreshes snapshots on heartbeat.

**Verification completed 2026-07-01:**
- Backend: `490 passed`, mypy clean across 185 source files, no pending
  migrations, Django system check clean.
- Frontend: `369 passed`, TypeScript clean, lint passed with the three existing
  unrelated `<img>` warnings, Prettier check passed.
- Manual local SSE smoke: `uvicorn` on `127.0.0.1:8010`, Redis host port `6389`
  due local port conflicts. Authenticated SSE returned initial `snapshot`; two
  scanner check-ins produced persisted analytics rows and a live `invalidate` +
  refreshed `snapshot` showing `checked_in: 2`, throughput/gate utilization, and
  recent activity without waiting for the polling interval.

**Known caveats/follow-ups:**
- Production is still blocked by Fly billing/manual machine stop; none of this is
  deployed yet.
- CSV import emits per-row `guest.registered` invalidations plus final
  `csv_import.complete`. Acceptable for current scale; coalesce later if large
  imports create noisy streams.
- Existing frontend `<img>` lint warnings remain outside this slice.
- Consider a future frontend integration test that uses real React Query fallback
  fetches instead of mocked `useEventStats`.

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
