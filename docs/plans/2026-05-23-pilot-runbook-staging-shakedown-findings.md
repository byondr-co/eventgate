# Pilot runbook — first staging shakedown findings (2026-05-23)

> **Methodology:** [`2026-05-23-pilot-launch-runbook.md`](./2026-05-23-pilot-launch-runbook.md) §1.1–1.5, run interactively against `eventgate-backend-staging.fly.dev` + `frontend-five-lovat-94.vercel.app`. Test event: `verido-solutions/plan-f-event`.
>
> **Verdict:** Runbook is **operationally sound** — every gate it defines actually fired and surfaced a real defect, including four that would have killed the first pilot. Production state on staging is now consistent with `main` HEAD; cross-device browser flows (§1.5 Flow 1 + Flow 2 Step 2d) remain user-driven and deferred.
>
> **Author:** Vinei (vinei.ro@squeeze-inc.co.jp).

---

## What the runbook caught

Each row is a finding the runbook gated against and that was sitting silently broken before today. The runbook's value is not its prose — it's that running §1.2 + §1.3 against staging surfaced these in the first 20 minutes.

| # | Finding | Gate that caught it | Pilot impact if undetected | Fix |
| --- | --- | --- | --- | --- |
| 1 | **Fly `release_command` was silently broken since `b363dec`.** The unquoted `&&` was being parsed as argv to `python manage.py migrate`. Every backend deploy from `b363dec` through `e7d5de7` (10+ commits, 11 hours) hard-failed at release_command, leaving prod stranded at version 22. New beat process, walkin_capacity migration, advisory lock, role validation, dev_login, hydration fix, MEDIA serving — all repo-only, none in prod. | §1.2 GHA `Deploy backend to Fly` row showing `completed failure` × 5 | P1. Door-day "deploy a hotfix" would have failed in the same way; no observability. | `742e061` wrapped in `sh -c '...'` so the shell parses `&&`. |
| 2 | **`walkin_capacity` had no UI.** Backend model + serializer + advisory lock all shipped; scanner display rendered the cap. But event-create + event-settings pages had no input. Customer literally could not set the cap. | §1.5 manual walk-through ("there is no form input to set the walk-in capacity") | P1 if the pilot customer wants a hard cap. Default = 0 (unlimited) was a fallback, not a feature. | `592cb06` added a number input to `EventCreateWizard` and a new `WalkinSettingsCard` on the settings page, plus `useUpdateEvent` mutation in `lib/events.ts`. |
| 3 | **Telegram was fully unconfigured on staging.** Zero `TELEGRAM_*` Fly secrets, no `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` on Vercel, no webhook registered (Telegram still pointed at a stale local-E2E ngrok URL). `setup_telegram_webhook` silently no-ops when `TELEGRAM_BOT_TOKEN` is unset, so the deploy went green despite the integration being dark. | §1.3 ("Telegram bot configured"); Vercel CTA absence; `getWebhookInfo` returning ngrok URL | P1 if pilot uses Telegram; P3 otherwise. | User set 4 Fly secrets + 1 Vercel env var; I ran `setup_telegram_webhook` directly against the live app (because `flyctl secrets set` does NOT run release_command, only a rolling restart). |
| 4 | **Multi-machine file storage gap.** Default Django `FileField` writes to `MEDIA_ROOT` on local disk. On Fly the `app` machine (gunicorn) and `worker` machine (Celery) are separate Fly Machines with separate filesystems — files uploaded to `app` are invisible to `worker`. CSV import POSTed cleanly, then `process_csv_import_task` threw `FileNotFoundError`. Caught only by `d3598aa`'s top-level try/except, which flipped status to "Failed" with no rows processed. | §1.5 Plan G §3 CSV import upload | P1 — first CSV import attempt in production would have failed silently with "Imported 0 / 0. 0 failed." | Provisioned Fly Tigris via `flyctl storage create`. Added `django-storages[s3]>=1.14`. Wired `STORAGES["default"]` to `storages.backends.s3.S3Storage` in prod settings, gated on `BUCKET_NAME` presence so dev (local-disk) still works. `766c6b1`. |

Plus 3 runbook-doc patches (`ecd4049`, `fc26f24`, `4f11811`):

- §1.3 trigger-test recipe used a placeholder UUID — fires zero-row UPDATE which the `FOR EACH ROW` trigger skips silently. Patched to fetch a real row first.
- §1.3 Telegram block — added explicit note that `flyctl secrets set` does NOT run `release_command`, so `setup_telegram_webhook` must be re-run manually after a `TELEGRAM_WEBHOOK_URL` change.
- §1.5 — added pointer to the actual staging test event (`verido-solutions/plan-f-event`); the seeded `dev-acme/dev-conf` is local-only.

---

## Gates passed (§1.1–§1.5)

| Section | Item | Evidence |
| --- | --- | --- |
| §1.2 | Backend pytest | 257 passed, 0 failed |
| §1.2 | Backend mypy | 137 files clean |
| §1.2 | Frontend vitest | 29 passed (5 files) |
| §1.2 | Frontend tsc / lint / prettier | all clean |
| §1.2 | GHA `Deploy backend to Fly` | green on `742e061` + `592cb06` + `766c6b1` |
| §1.2 | Vercel auto-deploy | live on origin/main |
| §1.3 | Migrations applied | `events.0003_event_walkin_capacity`, `guests.0004_csvimport_last_error` both `[X]` |
| §1.3 | Append-only audit trigger | `pg_trigger` row present (`tgtype=27`), fires on UPDATE/DELETE against real rows with `IntegrityError audit_auditevent is append-only` |
| §1.3 | Celery beat process group | running on machine `32870e95a97485`; 1 OOM on first boot (84MB anon-rss on 256MB budget) self-recovered via `restart=always` |
| §1.3 | Resend domain + outbound email | QR PNG delivered to allow-listed inbox within ~30s |
| §1.3 | Telegram bot fully configured | webhook URL = Fly URL, audit chain shows `notifications.telegram_rebound` + `notifications.telegram_sent` for the test guest |
| §1.3 | Sentry receiving events | tagged `capture_message` from `python manage.py shell` landed in the eventgate Sentry project within seconds |
| §1.3 | `FLY_API_TOKEN` GHA secret | present in `gh api repos/.../actions/secrets` |
| §1.5 / Plan G §3 | CSV import E2E | upload `runbook-csv.csv` → 3 imported (rows 2, 3, 6) + 2 errored (rows 4, 5); status=`complete`; `guest.created_via_csv` audit rows present |

---

## Open — user-driven (deferred to next browser session)

In rough priority:

1. **Cross-device Flow 1 (offline `checkin.conflict`)** — last verified at the [2026-05-23 findings run](./2026-05-23-plan-f-cross-device-reverification-findings.md) on local. Re-running on staging is what `2026-05-22-plan-f-cross-device-reverification.md` Flow 1 documents. Estimated 10 min.
2. **Cross-device Flow 2 Step 2d (walk-in cap hit)** — newly testable thanks to `walkin_capacity` UI from `592cb06` + advisory-lock enforcement from `a386ca0`. Set cap = 2 via the new settings card, claim 2 slots from one device, attempt a 3rd from another — expect 4xx server-side + tablet showing "no slots". Estimated 5 min.
3. **Plan G §3 re-upload duplicate test** (`runbook-csv.csv` re-uploaded against fresh imports → all 5 rows flagged duplicate or row-level error). Strict §3 covers it; the happy path was already verified. Estimated 2 min.

## Open — external

4. **Brand name** — Phase-0 task per brief §12 footer. Repo + Fly app + Vercel project + Sentry project + Resend domain + Telegram bot username all need rename when chosen.
5. **Khmer copy review** — translator pass on `frontend/lib/i18n/messages/km.json` (scanner + walk-in + error messages), helpdesk strings, Telegram bot replies, email templates.

## Non-blockers / hygiene watch

- **Celery beat OOM on initial boot** (84 MB anon-rss on 256 MB budget). Self-recovered. Recurring → bump beat VM to `384mb` in `backend/fly.toml`.
- **Vercel `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` marked "Sensitive"** — cosmetic only (the var is by definition client-exposed) but worth un-flagging.
- Original CSVImport row `3eb3d2be-734b-41cc-8884-5c82d7ea7eb3` deleted (referenced orphaned local-disk path from before Tigris fix).
- Audit-viewer UX gap (`details_json` not rendered), `swr` ↔ `@tanstack/react-query` dedup, pre-commit `prettier --check` hook — all still open from Plan F findings.

---

## Commit trail (today)

In chronological order:

| SHA | Subject | Why |
| --- | --- | --- |
| `cb8782c` | `docs(plans): pilot launch runbook synthesizing Plan F/G verification + cross-device findings` | Initial runbook landed |
| `742e061` | `fix(fly): wrap release_command in sh -c so && is shell-parsed` | Unwedged 10+ stranded commits |
| `ecd4049` | `docs(plans): patch runbook from 2026-05-23 staging shakedown — trigger-check + appendix-A status` | Trigger test fix + truthful Appendix A |
| `592cb06` | `feat(events): walkin_capacity input on event create + new settings card` | Pilot-blocker UI gap |
| `9ab1530` | `nit(gitignore): Ignore env files` | Vinei: `.vercel` + `.env*` |
| `fc26f24` | `docs(plans): runbook note — setup_telegram_webhook must be re-run after secret change` | `flyctl secrets set` skips release_command |
| `4f11811` | `docs(plans): runbook §1.5 — point at the verido-solutions/plan-f-event staging test event` | Test-event clarity |
| `766c6b1` | `feat(storage): use Fly Tigris S3 for media uploads in prod (multi-machine fix)` | CSV import blocker |

8 commits. 4 product/infra fixes + 4 docs.

## Operational state at session end

- `eventgate-backend-staging` — version 37, all 4 machines (`app`, `beat`, `worker`, `beat†` standby) on the same image, health 200, DB ok.
- `frontend-five-lovat-94.vercel.app` — auto-deployed `766c6b1` (most recent).
- Tigris bucket `eventgate-backend-staging-media` provisioned, secrets injected.
- Test event left in place: `verido-solutions/plan-f-event` (Plan F Acceptance) with existing test guests + Gate F1 + Gate F2 + PIN `4242`. CsvImport `699799a7-d02b-...` left as a passing trail.

---

## Lesson the runbook should encode going forward

**§1.2 GHA gate isn't optional.** Today's biggest finding (broken release_command for 11 hours) was caught by a single column in `gh run list --workflow deploy-backend.yml` showing `completed failure` × 5. The repo + pytest + mypy + lint were all green; tests passed; mypy clean; nothing reflected that prod was stranded. The only signal was the deploy pipeline. Anyone pushing a P1 day-of hotfix would have hit the same wall.

This is captured in the runbook's §1.2 prose, but the lesson is sharper after seeing it land: **green-on-green-on-green ≠ shippable**. The thing standing between a healthy repo and a healthy production is the deploy pipeline's green checkmark.
