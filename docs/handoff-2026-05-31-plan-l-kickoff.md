# Plan L Kickoff — Handoff for New Chat Session

> **For a fresh Claude in a new chat session.** This doc has everything you need to pick up Plan L's brainstorm without re-investigating the codebase or re-reading prior session transcripts.

## What just happened (one-line summary)

Plan K shipped end-to-end earlier today (8 PRs, K1–K8, all merged on `byondr-co/eventgate` `main`). Then the user ran an early pilot test on prod and got real client feedback: 5 reported bugs + 5 feature requests. **3 of the 5 "bugs" were stale-prod artifacts** — fixed by a `flyctl deploy` of the prod backend (now at v7, Plan K live). **2 remain as real code bugs.** Of the 5 features, the biggest (Google Form integration) is being deferred to its own Plan M; the other 4 stay in Plan L.

## Current state of the world

| Surface | Where | Status |
|---|---|---|
| Repo | https://github.com/byondr-co/eventgate (PUBLIC) | main tip = `ac183ba` |
| Prod frontend | `https://eventgate.byondr.co` | Vercel, auto-deploys on main push |
| Prod backend | `https://api.eventgate.byondr.co` | Fly `eventgate-backend-prod`, **v7** (deployed 2026-05-31 ~08:28 UTC; manual `flyctl deploy` since prod auto-deploy isn't wired) |
| Staging frontend | `https://eventgate-staging.byondr.co` | Vercel, auto-deploys on main push |
| Staging backend | `https://api.eventgate-staging.byondr.co` | Fly `eventgate-backend-staging`, auto-deploys via `deploy-backend.yml` |
| Brand / umbrella | Eventgate on `byondr.co` (GitHub org `byondr-co`). Khmer = `អ៊ីវ៉ិនហ្គេត` | locked, Plan J shipped 2026-05-30 |
| Pilot window | 2026-06-19 → 2026-07-17 | Click Cam confirmed |
| Today | 2026-05-31 | 19 days until pilot opens; T-7 = 2026-06-12 |

## What's in Plan L (scope locked during prior brainstorm)

7 items. Plan M (Google Form/Spreadsheet integration) is a separate future plan — **NOT** part of Plan L.

| # | Item | Effort | Type |
|---|---|---|---|
| L-bug-1 | Duplicate breadcrumb on event page | XS (~5 min) | bug |
| L-bug-2 | Replace `window.confirm` with shadcn Dialog modal across all delete-confirmation sites | S (~30 min) | bug |
| L-ops-1 | Wire `deploy-backend-prod.yml` to auto-deploy on push to main | XS (~10 min) | ops debt |
| L-feat-4 | Resend QR button per guest row | S | feature |
| L-feat-5 | Search & filter guest list | M | feature |
| L-feat-3 | Short URL management page: CRUD UI + new model fields (`visit_count`, `click_count`, `note`, mutable `expires_at`) | M | feature |
| L-feat-2 | Registration form banner + template (Google-Forms-like polish) | M-L | feature |

### Specific findings to bake into Plan L design

- **L-bug-1 root cause:** both `frontend/app/(app)/orgs/[slug]/layout.tsx` (added by Plan K2) AND `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx` (added by Plan J Wave 6) render `<BreadcrumbTrail />`. When you navigate into an event subtree, Next.js layouts compose — both render. Fix: remove `<BreadcrumbTrail />` from the event layout (the org layout above it already provides the breadcrumb). Keep `<EventTabsNav />` in the event layout.

- **L-bug-2:** `frontend/components/events/registration-form-builder.tsx` calls `window.confirm()` for preset-field delete (Plan K7). `frontend/components/orgs/members-table.tsx` calls `window.confirm()` for member remove (Plan K4). Both should switch to shadcn `Dialog` with a destructive-styled "Confirm delete" button. Build a small `<ConfirmDialog>` reusable in `frontend/components/ui/` or `frontend/components/common/`.

- **L-ops-1:** Add `push: branches: [main]` to `.github/workflows/deploy-backend-prod.yml` so prod auto-deploys (currently only `workflow_dispatch` and `release: types: [published]`). Plan I/J added the manual gate for safety — but the real safety is "tests on PR before merge", which we already have. Manual gate just delays without adding safety. **3-line YAML change.**

- **L-feat-3 needs a `ShortUrl` model update:** add `visit_count` (PositiveIntegerField default 0), `click_count` (PositiveIntegerField default 0 — or fold into visit_count), `note` (TextField blank=True). Track on `/r/<code>/` view: `F("visit_count") + 1`. Decide in brainstorm: separate visit vs click counts (visit = hit `/r/<code>`, click = follow-through to target) — or just one `visit_count`. The user mentioned both, so probably both.

## Operational lessons banked (cumulative, from Plan J + Plan K execution)

These are documented in `docs/plans/improvement-and-findings-logs.md`. Surface them upfront to any agent dispatched during Plan L:

1. **No `make_user` / `make_org` fixtures in conftest.py.** Tests use direct ORM (`User.objects.create_user`, `Organization.objects.create_with_unique_slug`, `OrganizationMembership.objects.create`). See `backend/tests/test_orgs_update.py` or `backend/tests/test_short_urls.py` for the working `_make_user` / `_make_org` helper pattern.
2. **Frontend `tsconfig.target = "es2017"`** doesn't support the `s` (dotAll) regex flag. Use `[\s\S]+` instead of `.+` with `/s`.
3. **`vi.mock("@/lib/api")`** must export every consumed binding when the mocked module changes. Stale mocks silently break with new exports.
4. **`isolation: "worktree"` can silently fail** in agent dispatches. First step in every agent prompt: `pwd` check; expect path under `.claude/worktrees/agent-<id>/`. K4 hit this; K5+ added the explicit check.
5. **Codebase soft-delete pattern:** `OrganizationMembership.is_active` exists; `Invite.revoked_at` exists. Use these instead of hard `.delete()` when the model already supports soft-delete.
6. **Pre-commit hooks may modify files mid-commit** (ruff-format, prettier). Re-stage and commit as NEW commit (no `--amend`).
7. **`flyctl ssh console`** is intermittently flaky. Don't rely on it for critical verification; prefer HTTP API / curl / Telegram API endpoints.
8. **PUBLIC repo:** customer names (The Click Cam) + collaborator first names (Vatana) are in commit history (improvement log + handoff docs). Acceptable per user — flagged in earlier handoffs.

## File pointers (read these before brainstorming if needed)

| File | Why |
|---|---|
| `docs/plans/2026-05-29-plan-j-byondr-umbrella-rename.md` | byondr umbrella + Eventgate brand spec |
| `docs/plans/2026-05-31-plan-k-pre-pilot-enhancements.md` | Plan K spec (what just shipped) |
| `docs/plans/2026-05-31-plan-k-implementation.md` | Plan K bite-sized impl plan (template for Plan L's plan doc) |
| `docs/handoff-2026-05-31-plan-k-shipped.md` | Plan K closeout — full PR table, test count growth |
| `docs/plans/improvement-and-findings-logs.md` | Cumulative lessons (Plan H + I + J + K wrap-ups) |
| `docs/plans/2026-05-23-pilot-launch-runbook.md` | Pilot runbook (updated in Plan J Wave 9; references byondr URLs + new pilot window) |
| `frontend/AGENTS.md` + `frontend/CLAUDE.md` | "This Next.js has breaking changes from your training data" — read before TSX |

## Memory files (auto-loaded in user's home dir; reference, don't modify unless decision-justified)

- `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/feedback_execution_workflow.md` — per-task worktree + parallel-wave execution pattern
- `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/project_conventions.md` — plans at `docs/plans/`, no `Co-Authored-By` trailer, single-line conventional-commit
- `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/project_pilot_window.md` — 2026-06-19 → 2026-07-17
- `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/project_brand_pick.md` — Eventgate final, byondr-co umbrella

## What the new Claude should do first

1. **Read this handoff doc**, plus the file pointers above as needed.
2. **Invoke `superpowers:brainstorming` skill** with Plan L scope.
3. **Skip re-investigating bugs 3/4/5** — they were stale-prod artifacts; prod was redeployed; the user is spot-checking on prod in parallel. Just confirm with the user that they verified before locking the spec.
4. **Brainstorm L-bug-1, L-bug-2, L-ops-1, L-feat-4, L-feat-5, L-feat-3, L-feat-2 in that order** (bugs first, then small features, then medium, then medium-large).
5. **Lock visual decisions** for `L-feat-2` (banner + template) and `L-feat-3` (short URL management page) via the visual companion. The other items are mostly conceptual.
6. After spec is approved, **invoke `superpowers:writing-plans`** to produce the bite-sized impl plan. **Slice into small PRs (Plan K style — 6-8 small PRs)**, not 2 mega-PRs. User explicitly prefers small slices.
7. Each PR slice dispatches one agent in an isolated worktree (single-shot pattern). Auto-merge + auto-dispatch-next on CI green.

## Plan L target dates

- **Plan L spec + impl plan committed:** today or tomorrow (2026-05-31 / 06-01)
- **Plan L all PRs merged:** by 2026-06-08 (T-11 of pilot)
- **Plan M (Google integration) starts:** after Plan L lands
- **Plan M target merged:** by 2026-06-12 (T-7) so it's available for the T-3 dry-run smoke

## Things explicitly NOT in Plan L (deferred to Plan M, later)

- Google Form / Spreadsheet integration (its own plan)
- Anything Plan K already shipped (don't re-do)
- Brand identity (logo, marketing) — Plan H §5 still out-of-scope
- `ALLOWED_HOSTS` narrowing from `"*"` (Plan J operational debt)
- Audit log of role changes (Plan K §9 follow-up)
- byondr.co apex landing page

## How to start the new chat session

The new Claude only needs this prompt:

```
We're starting Plan L for the byondr-co/eventgate project. Please read
docs/handoff-2026-05-31-plan-l-kickoff.md first — it has the full context
(brand, infra, prior plans, bugs found in early pilot test, lessons banked,
file pointers). Then invoke the brainstorming skill to design Plan L.
```

That's enough. The handoff doc has everything else.

---

**Handoff doc complete. Plan L brainstorm can now begin in a fresh chat session.**
