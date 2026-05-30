# Handoff — 2026-05-30 (Plan J shipped — byondr umbrella rename + prod env split)

> **Status:** Plan J complete. Eventgate is live at `eventgate.byondr.co` (frontend) + `api.eventgate.byondr.co` (backend) under the byondr.co umbrella. Pilot opens 2026-06-19 (slipped +2 weeks from original 2026-06-05 — Click Cam confirmed). Customer: The Click Cam. Window: 2026-06-19 → 2026-07-17.

## What shipped in Plan J

All waves executed across 3 PRs + out-of-repo infra provisioning.

| PR | Title | Notes |
|---|---|---|
| [#11](https://github.com/byondr-co/eventgate/pull/11) | feat(brand): rename gatethres → eventgate (Wave 3) | Cookie names, SW cache key v2→v3, Celery app name, pyproject, manifest, all brand strings, README, brief |
| [#12](https://github.com/byondr-co/eventgate/pull/12) | chore(plan-j): correct Fly app name + GitHub org (Wave 3.5) | `eventgate-backend-prod` app name fix + `byondr-co` org fix in fly.prod.toml + deploy workflow |
| Wave 9 closeout PR (this) | docs(plan-j): wave 9 closeout — brief + runbook + improvement log + handoff | Docs sweep; no code changes |

**Out-of-repo infra provisioned (not in PRs):**
- `byondr-co` GitHub org; repo transferred from `vineidev/gatethres` to `byondr-co/eventgate` (made PUBLIC for Vercel integration)
- 4 GoDaddy DNS CNAMEs: `eventgate`, `api.eventgate`, `eventgate-staging`, `api.eventgate-staging` all under `byondr.co`
- New Fly app `eventgate-backend-prod` (Singapore) — 3 process groups (app + worker + beat), 26 secrets
- Resend domain `mail.byondr.co` verified (Tokyo region); sender `noreply@mail.byondr.co`
- New Vercel project `eventgate-prod` → `eventgate.byondr.co`; staging renamed → `eventgate-staging` → `eventgate-staging.byondr.co`
- Telegram bot `@eventgate_bot` token rotated + webhook repointed to `api.eventgate.byondr.co`
- Sentry project `eventgate-prod` configured (pipeline active; no programmatic test event fired due to flyctl SSH flakiness)

## What's deployed where

| Env | Backend | Frontend | Fly app | Status |
|---|---|---|---|---|
| Production | `api.eventgate.byondr.co` | `eventgate.byondr.co` | `eventgate-backend-prod` (sin) | ✅ live, returning 200 |
| Staging | `api.eventgate-staging.byondr.co` | `eventgate-staging.byondr.co` | `eventgate-backend-staging` (sin) | ✅ live, returning 200 |

**Smoke state (as of Wave 8 completion):**
- ✅ Resend deliverability: prod magic-link email confirmed
- ✅ Prod magic-link login: end-to-end ✓
- ✅ Telegram webhook: `getWebhookInfo` returns prod URL, `pending_update_count=0`
- ⚠️ Staging magic-link URL fix deployed (Wave 8 — `MAGIC_LINK_FRONTEND_URL` + `PUBLIC_BASE_URL` corrected); verify before T-7
- ⚠️ Sentry `eventgate-prod` pipeline configured but no programmatic test event confirmed (flyctl SSH flaky during Wave 8); fire a deliberate 500 at T-7 to confirm

## Cumulative operational gotchas

See [`docs/plans/improvement-and-findings-logs.md`](plans/improvement-and-findings-logs.md) §Plan J wrap-up for full detail. Summary:

1. **`ALLOWED_HOSTS="*"` on BOTH prod and staging** — narrower patterns don't match Fly's Consul health probe. Pragmatic wildcard. **Plan K TODO: narrow once exact Consul Host header is known.**
2. **`flyctl deploy` on fresh multi-process app only creates `app` machine** — always run `flyctl scale count app=1 worker=1 beat=1 --app <app> --region sin --yes` after first deploy.
3. **Vercel new-project Root Directory defaults to repo root** — set to `frontend` explicitly in Settings → General on any new monorepo Vercel project.
4. **Staging secrets diff must cover ALL env-dependent values** — not just ALLOWED_HOSTS + CSRF. Include MAGIC_LINK_FRONTEND_URL, PUBLIC_BASE_URL, RESEND_FROM_EMAIL, DEFAULT_FROM_EMAIL.
5. **flyctl SSH is intermittently flaky** — prefer HTTP API / Telegram API for verification; avoid SSH in agent workflows.
6. **Long agent dispatches can hang silently on flyctl SSH stalls** — add per-command timeouts in future plan agents.
7. **`flyctl secrets set` "failed to acquire lease"** — wait ~1 min and retry if multiple flyctl ops run in quick succession.
8. **Fly SSH does NOT inherit Docker ENV** (from Plan H) — use `/app/.venv/bin/python manage.py …` explicitly.
9. **`flyctl secrets set` does NOT run `release_command`** (from Plan H) — management commands (e.g., `setup_telegram_webhook`) must run manually after secrets land.
10. **Vercel `NEXT_PUBLIC_*` env vars inline at build time** (from Plan H) — trigger a redeploy after any change.

## Pilot-prep cadence (calendar)

| Date | Distance from T-0 | Activity | Status |
|---|---|---|---|
| 2026-05-30 | T-20 | Plan J ship + Wave 9 closeout | ✅ done (this handoff) |
| 2026-06-12 | T-7 | Runbook §1.2 GHA gate + §1.3 infra dry-run; confirm Sentry prod test event | pending |
| 2026-06-16 | T-3 | Plan F verification + Plan G regression smoke + cross-device flows on prod | pending |
| 2026-06-18 | T-1 | Full dry-run on Vatana's device + PWA install banner + Khmer copy spot-check | pending |
| 2026-06-19 | T-0 | Pilot opens | scheduled |
| 2026-07-17 | T+28 | Pilot window closes | scheduled |

## Open follow-ups

| Item | Priority | Notes |
|---|---|---|
| Narrow `ALLOWED_HOSTS` | Post-pilot (Plan K) | Identify exact Fly Consul Host header and replace `"*"` with specific values |
| byondr.co landing page | Plan K or standalone | No landing page on the apex domain yet |
| Multi-region Neon read replica | Plan K (if pilot growth justifies) | Current: single Singapore Neon instance |
| Sentry `eventgate-prod` programmatic test event | T-7 (2026-06-12) | Fire a deliberate 500 + confirm issue lands within 60s |
| Staging magic-link URL re-verify | T-7 (2026-06-12) | Confirm MAGIC_LINK_FRONTEND_URL pointing at staging URL works end-to-end |
| Vatana Khmer copy review | Before T-0 | Machine-quality km.json strings; needs one-pass review before pilot |
| Khmer transliteration Vatana round-trip | Pre-pilot | User provided `អ៊ីវ៉ិនហ្គេត` 2026-05-29; Vatana hasn't yet confirmed it |
| Beat VM memory watch | Ongoing | Beat OOM on first boot observed in Plan H; watch on each redeploy |

## Memory notes (auto-loaded for the user)

Updated this session:
- Brand = **Eventgate** (final, Plan J 2026-05-30); product at `eventgate.byondr.co`; email `noreply@mail.byondr.co`; Khmer `អ៊ីវ៉ិនហ្គេត`; GitHub org `byondr-co`
- Pilot window: **2026-06-19 → 2026-07-17** (slipped +2 weeks from original 2026-06-05)
- Per-task worktree + parallel-wave execution workflow (unchanged)
- Eventgate repo conventions: plans in `docs/plans/`, conventional-commit subjects, no Co-Authored-By trailer (unchanged)
