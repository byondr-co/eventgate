# Handoff — 2026-05-31 (Plan K shipped end-to-end)

> **Status:** Plan K complete. 8 PRs merged, 11 enhancement items closed (10 active + 1 doc-only). Pilot opens 2026-06-19 (19 days away). T-7 dry-run = 2026-06-12.

## What just shipped (Plan K)

10 pre-pilot UX/UX-adjacent enhancements + 1 doc verification, sliced into 8 small PRs landing across one day on top of Plan J's byondr-co/eventgate stack.

| PR | Title | Merge SHA | Items |
|---|---|---|---|
| [#15](https://github.com/byondr-co/eventgate/pull/15) | feat(plan-k1): plumbing & quick wins | `8d2fbf6` | #1 placeholders, #4/#7 error parser, #8a session 1d, #11 doc |
| [#16](https://github.com/byondr-co/eventgate/pull/16) | feat(plan-k2): org-context layout | `9eed2da` | #2 members page org awareness |
| [#17](https://github.com/byondr-co/eventgate/pull/17) | feat(plan-k3): inline-editable org name + PATCH endpoint | `8849003` | #3 org rename |
| [#18](https://github.com/byondr-co/eventgate/pull/18) | feat(plan-k4): member CRUD — role / soft-remove / cancel invite | `b9bb9f2` | #5 member CRUD |
| [#19](https://github.com/byondr-co/eventgate/pull/19) | feat(plan-k5): short URL + copy buttons | `1216bc0` | #6 public URL versions |
| [#20](https://github.com/byondr-co/eventgate/pull/20) | feat(plan-k6): CSV import drop-zone + wider modal | `cc6b503` | #10 CSV modal UX |
| [#21](https://github.com/byondr-co/eventgate/pull/21) | feat(plan-k7): preset registration fields are now deletable | `fc5577f` | #9 preset deletable |
| [#22](https://github.com/byondr-co/eventgate/pull/22) | feat(plan-k8): silent refresh of access token | `76223bb` | #8b silent refresh |

Plus the docs PR landing the Plan K spec + impl plan: [#14](https://github.com/byondr-co/eventgate/pull/14) `d735d1b`.

**Main tip:** `76223bb`.

## New capabilities live on prod

### Operator UX
- **Inline-edit org name** (pencil affordance on the org dashboard; PATCH `/api/v1/orgs/<slug>/`)
- **Member management** — per-row role dropdown, Remove button (soft-delete via `is_active=False`), pending-invite cancel
- **Org-context navigation** — breadcrumb + Events/Members tabs on every org-level page (hides itself inside event subtree)
- **Public registration link** — both full URL and short URL (`eventgate.byondr.co/r/<code>`) with copy-to-clipboard buttons
- **CSV import** — drag-and-drop file zone + wider modal (`max-w-5xl`)
- **Preset registration fields are deletable** — operator can remove `email`/`name`/`phone_or_chat` with a destructive-warning confirm
- **Better error messages** — every form mutation now parses `detail` from API responses; no more raw `400 : {"detail":...}` strings
- **24h session length** with silent refresh — operators don't get logged out during a normal pilot day

### Architecture
- New `apps/shorturls/` Django app — `ShortUrl` model + post_save signal that auto-creates per-event short codes + public `/r/<code>/` redirect view
- New `frontend/lib/auth-refresh.ts` — proactive refresh timer (~23h) + `<SessionRefreshProvider>` wrapping the dashboard layout
- New `frontend/lib/api.ts:extractApiError()` — generic API error parser used across all form mutations
- New `frontend/components/nav/org-tabs-nav.tsx` + new `app/(app)/orgs/[slug]/layout.tsx` — completes the structural-nav hierarchy that started in Plan J
- New `<CopyButton>` + `<PublicUrlCard>` + `<CsvDropZone>` + `<OrgNameEditor>` reusable components

## Test surface growth

- Backend pytest: 283 → **309** (+26 over Plan K)
- Frontend vitest: 73 → **99** (+26 over Plan K)
- All 8 CI gates (pytest, mypy `apps config`, ruff×2, lint, prettier, tsc, vitest) green on every K1–K8 merge

## Operational gotchas captured during Plan K

(Full list in `docs/plans/improvement-and-findings-logs.md` Plan K wrap-up section. Three highest-impact ones:)

1. **`isolation: "worktree"` can silently fail** — agents must verify `pwd` is under `.claude/worktrees/agent-<id>/` before any code change. K4 hit this; K5–K8 added the explicit check and it worked every time.
2. **`vi.mock("@/lib/api")` must export every consumed binding** when the mocked module changes. A test that mocked the module before a new export was added will silently fail to find that export until updated.
3. **Frontend `tsconfig.target = "es2017"`** doesn't support the `s` (dotAll) regex flag. Use `[\s\S]+` instead of `.+` with `/s`.

## Where things stand for pilot

| Surface | URL | Status |
|---|---|---|
| Frontend prod | `https://eventgate.byondr.co` | ✅ |
| Backend prod | `https://api.eventgate.byondr.co` | ✅ |
| Frontend staging | `https://eventgate-staging.byondr.co` | ✅ |
| Backend staging | `https://api.eventgate-staging.byondr.co` | ✅ |
| Email (both envs) | `noreply@mail.byondr.co` verified | ✅ |
| Magic-link emails | Correct URL per env | ✅ |
| Short URLs (new) | `eventgate.byondr.co/r/<8-char-code>` | ✅ |
| Telegram webhook | `api.eventgate.byondr.co` | ✅ |
| Sentry prod + staging | Both projects capturing events | ✅ |
| Pilot window | 2026-06-19 → 2026-07-17 | confirmed |

## Pilot-prep cadence

- **T-7 = 2026-06-12** (12 days from today) — runbook §1.2 GHA gate check + §1.3 infra dry-run; exercise the new member-CRUD, short-URL share, CSV drop-zone, and silent-refresh flows
- **T-3 = 2026-06-16** — Plan F regression + Plan G smoke + end-to-end registration flow with QR delivery on a non-owner email
- **T-1 = 2026-06-18** — full dry-run on Vatana's device; verify the new UX is intuitive in a single sitting
- **T-0 = 2026-06-19** — pilot opens
- **T+28 = 2026-07-17** — pilot window closes

## Open backlog (post-pilot Plan L+ candidates)

From Plan K §9 follow-ups (carried forward):

- **Narrow `ALLOWED_HOSTS`** from `"*"` to specific Fly Consul Host pattern (Plan J operational debt)
- **Audit log of role changes / membership removals**
- **Refresh-token revocation on logout** (currently logout only clears the cookie locally)
- **Short URL analytics** — click count per code (organizers asked-for surface)
- **Custom domain support for short URLs** — per-customer vanity (`gallery.click-cam.com/r/<code>` style)
- **Slug rename for orgs** (only `name` is editable today)
- **Reusable `<DropZone>` extraction** for other upload surfaces (event logo, walk-in receipt upload, etc.)
- **Sole-owner UX hardening** — surface a "transfer ownership" flow instead of just rejecting
- **byondr.co landing page** at apex (Plan J §9 follow-up — still deferred)
- **Multi-region Neon read replica** if pilot growth justifies
- **Daily logical `pg_dump` backup** for prod (Plan J §9 follow-up)
- **Brand identity** — logo, color palette, type system, marketing site (Plan H §5 out-of-scope)

## Memory notes (auto-loaded for the user)

Unchanged from earlier handoffs:
- Per-task worktree + parallel-wave execution workflow
- Eventgate repo conventions (plans at `docs/plans/`, no `Co-Authored-By` trailer)
- Pilot window 2026-06-19 → 2026-07-17
- Brand = Eventgate on byondr-co umbrella (Plan J 2026-05-30); product at `eventgate.byondr.co`; email `noreply@mail.byondr.co`; Khmer `អ៊ីវ៉ិនហ្គេត`
