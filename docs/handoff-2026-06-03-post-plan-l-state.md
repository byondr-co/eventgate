# Handoff — 2026-06-03 (post Plan L + pilot-feedback round)

> **SUPERSEDED (2026-06-11).** Since this doc: Plan M (scanner-UI polish, NOT
> the Google integration named below), the monochrome UI rollout (#60–#69),
> Plan N (pilot reliability + Google Form bridge, merged `d4cc509`), and the
> UI/UX-deepening lane (#71 #73 #74 #75 #76) all shipped; Plan O (bridge Sheet
> operations) is open as PR #77. The "Plan M — Google Form integration"
> candidate below became Plan N. Current state: `docs/handoff-2026-05-20.md`
> (rolling, top section) and `docs/plans/2026-06-11-t7-gate-prep.md` (T-7 gate
> 2026-06-12).

> **For a fresh Claude in a new chat session.** Plan L and its hotfixes shipped, plus a large batch of pilot-feedback fixes/improvements. This doc captures the current state, what shipped, the open backlog, banked gotchas, and candidate next directions. The next session should **open with brainstorming** to pick the next plan with the user (no direction is pre-committed).

## One-line state
Everything is merged and deployed. `main` tip = `0d2fbdf`. No open PRs. Pilot opens **2026-06-19** (T-7 ≈ 2026-06-12; today 2026-06-03).

## Current state of the world

| Surface | Where | Status |
|---|---|---|
| Repo | https://github.com/byondr-co/eventgate (PUBLIC) | `main` = `0d2fbdf` |
| Prod frontend | `https://eventgate.byondr.co` | Vercel, auto-deploys on main push (frontend lags backend; see gotchas) |
| Prod backend | `https://api.eventgate.byondr.co` | Fly `eventgate-backend-prod`, release **v21**, health `GET /api/health/` = 200; auto-deploys on push to main scoped to `backend/**` |
| Staging | `*-staging.byondr.co` | auto-deploys |
| Redis | self-hosted on Fly (PR #53) | **off Upstash** as of 2026-06-02 (cost incident) |
| Pilot | 2026-06-19 → 2026-07-17 | Click Cam |

## What shipped this session (PRs #36–#57)

**Plan L hotfixes (pilot test round 1) — S1–S8 + proxy fix:**
- #36 S1 — `lib/toast.ts` (`notify.*`) + hardened `extractApiError` (never raw HTML/JSON) + `extractFieldErrors`.
- #37 S2 — dedicated multipart banner upload endpoint + `FileDropZone` + 4MB cap.
- #38 S3 — `/r/*` rewrite → backend in `next.config.ts`.
- #39 S4 — data-driven public registration form + inline errors.
- #40 S5 — block self-removal of membership + hide own-row Remove.
- #41 S6 — CSV import modal width/scroll.
- #42 S7 — toast action feedback in guests + links tables.
- #43 S8 — **banners served via presigned Tigris URLs** (ACLs don't make Tigris objects public; whole-bucket-public unsafe — see memory).
- #44 — proxy (`proxy.ts`, Next 16 middleware) allows anonymous `/r/*` (short links were bouncing to `/login`).

**Guest list overhaul:**
- #45 — walk-in **info form** is data-driven + shows banner.
- #46 — walk-in vs pre-registered **badge**; Email QR / Copy Telegram hidden for walk-ins.
- #47 — row numbers, humanized entry status (green "Checked-in"), pagination 25/50/100.
- #48 — page-size selection persists (localStorage).
- #49 — **chips filter** (Walk-in / Pre-registered / Checked-in / Not arrived; backend `?guest_type=` added) + frozen No/Actions columns.
- #50 — **data-driven columns** from the event's registration fields; removed frozen-column divider borders.

**Walk-in re-scan guard + scanner/devices:**
- #51 — localStorage walk-in re-scan guard + self-issued `device_id` audit (**soft deterrent, not enforcement** — see memory).
- #52 — scanner enroll page: fixed "already enrolled" flash, role-aware **resume link**, **PIN-gated reset**.
- #56 — device create: **inline validation error** (was raw `400 {…}`) + **revoked devices free their (label, role)** (partial unique constraint, migration `0002`).
- #57 — device dashboard page **instructions + "Open enrollment page" button**; walk-in **"Complete my info"** reminder on a blocked re-scan (tracks info completion in localStorage).

**Infra / CI (landed alongside, not all in this thread):**
- #53 — self-host Redis on Fly, drop Upstash (staging + prod).
- #54 / #55 — CI bumped to Node 24 (checkout/setup-node v5, pnpm/setup-uv, pinned setup-flyctl).

## Open follow-ups (nothing blocks Plan L — all deferred/known)

- **Walk-in capacity hard-enforcement** — deliberately **rejected** (memory `project_walkin_rescan_guard.md`). Current guard is a soft localStorage deterrent + `device_id` audit; a determined abuser can still drain `walkin_capacity`. Backstops: the hard cap + `voided`/`manual_review` cleanup tooling.
- **Deferred backlog (post-pilot):**
  - Narrow `ALLOWED_HOSTS` from `"*"` (Plan J debt).
  - Audit log of role changes / membership removals.
  - Refresh-token revocation on logout.
  - Short-URL custom domains (per-customer vanity).
  - Org slug rename.
  - Switch sender to `noreply@mail.byondr.co` once the prod email domain is verified (currently `onboarding@resend.dev`).
- **Plan M — Google Form / Spreadsheet integration** — the originally-designated "next plan" (deferred out of Plan L). Not started. Originally targeted before pilot.
- **Ops watch:** the prod backend deploy hit the workflow's **15-min timeout once** (#56) — a transient Fly build/rollout stall; a re-run (`gh run rerun <id>`) deployed cleanly as v21. If it recurs, consider raising `timeout-minutes` or investigating the Fly remote builder.
- **Housekeeping:** `dummy-guests-250.csv` (250-row test import file) sits untracked in the repo root — delete or keep.
- **Prod verification owed (user side):** the auth-gated UI changes (guest list, device page, walk-in info reminder) are test-covered but not prod-smoke-verified.

## Banked gotchas (READ — these bit during this session)

1. **gh auth account:** PRs must be created/merged as **`vineidev`** (`gh auth switch --hostname github.com --user vineidev`). The other account (`vinei`) is **not a collaborator** → `gh pr create` fails with "must be a collaborator". The active account can silently revert when a session resumes.
2. **Local backend tests need the Postgres container:** `docker start eventgate-postgres-1` (maps :5432). It can be stopped between sessions; symptom is `OperationalError: connection refused`. (The brew `postgresql@16` is a red herring — no data dir.)
3. **Frontend tooling needs Node ≥18 (use 20):** the shell default may be Node 12. `source ~/.nvm/nvm.sh && nvm use 20` before `pnpm`. CI uses Node 24.
4. **Fresh checkouts/worktrees** sometimes can't resolve `sonner`/`next-themes` → some `tsc`/test files error locally; **CI (clean install) is the authoritative gate**.
5. **Branch protection does NOT gate on `test`** — always `gh pr checks <n>` before merge. Backend+frontend PRs get two `test` jobs.
6. **Tigris** doesn't serve objects publicly via S3 ACLs and `PutBucketPolicy` is `NotImplemented`; whole-bucket-public would leak private `csv_imports/` PII. Banners use **presigned URLs**. (memory `reference_tigris_public_access.md`)
7. **Vercel prod frontend is NOT in the connected Vercel MCP account** — can't inspect/await its deploys from a session; frontend lags the immediate Fly backend deploy. (memory `reference_vercel_prod_frontend.md`)
8. **DRF default parsers are JSON-only** (`backend/config/settings/base.py`) — multipart endpoints must set `parser_classes` explicitly.
9. **`next.config.ts` only rewrites `/api/*`** by default; other backend paths (e.g. `/r/*`) need their own rewrite. Auth gating lives in **`frontend/proxy.ts`** (Next 16's renamed middleware), with a public-path allowlist.
10. **Repo uses Base UI (`@base-ui-components/react`), NOT Radix.**
11. **`flyctl ssh console`** is flaky for `django.setup()` shells (hangs); boto3-only one-liners work. Prefer HTTP/API checks.
12. **Project conventions** (memory `project_conventions.md`): plans in `docs/plans/`; single-line conventional commits; **no `Co-Authored-By` trailer**.

## Candidate next directions (for the opening brainstorm)
1. **Plan M — Google Form / Spreadsheet integration** (designated next; pilot-relevant).
2. **Pilot dry-run + hardening** — end-to-end prod shakedown of the full flow, verify the Redis self-host (#53) under load, pick off low-risk backlog (ALLOWED_HOSTS, audit log).
3. **Deferred-backlog sweep** — the list above.

## Memory files (auto-loaded; reference, don't modify unless decision-justified)
`feedback_execution_workflow.md`, `project_conventions.md`, `project_pilot_window.md`, `project_brand_pick.md`, `reference_vercel_prod_frontend.md`, `reference_tigris_public_access.md`, `project_walkin_rescan_guard.md`, `project_redis_migration.md`.

## How to start the next chat session

```
We're picking up the eventgate (byondr-co/eventgate) project after Plan L + the
pilot-feedback round. Please read docs/handoff-2026-06-03-post-plan-l-state.md first —
it has the full state, what shipped, the open backlog, and banked gotchas. Then invoke
the brainstorming skill to decide what to work on next (Plan M Google integration,
pilot dry-run/hardening, or the deferred backlog) before any implementation.
```

That prompt + this doc is everything the next session needs.
