# Pilot launch runbook — first committed pilot event

> **Authored:** 2026-05-23 · **Owner:** Vinei (vinei.ro@squeeze-inc.co.jp) · **Synthesizes:** Plan F verification checklist + Plan F findings + Plan F cross-device re-verification methodology + 2026-05-23 cross-device findings + Plan G Section 4 regression smoke.
>
> **Pilot window:** **2026-06-05 → 2026-07-03** (W13–14, first paying/pilot event under brief §12 Phase 1 exit criteria). Exact date TBC from the customer; treat anything not shipped by **2026-05-29** as risk-bearing.
>
> **Scope of this runbook:** what to verify _before_ ship, who runs the door, what to do when something breaks during the event, how to roll back, how to write up afterwards. Backend lives on Fly (`eventgate-backend-staging` today; rename when prod app lands), frontend on Vercel (`frontend-five-lovat-94` today; same caveat).
>
> **External blockers tracked here:**
>
> - **Brand name** — Phase-0 task per brief §12 footer. Status: ⏳ **pending** (shortlist + `.com`/`.app` check + TM check + pick). Fold the chosen brand into this doc + repo/app/domain renames before pilot. _Last updated: 2026-05-23._
> - **Khmer copy review** — translator identified per brief §12 row 4. Status: ⏳ **pending** (machine-quality strings in `frontend/lib/i18n/messages/km.json` covering Plan D scanner + Plan D walk-in + Plan E error messages + Plan F help-desk + Plan G Telegram/CSV; needs a one-pass review before pilot). _Last updated: 2026-05-23._

---

## 1. Pre-deploy checklist

> Run T-7 days, T-3 days, and T-1 day before the pilot event. Re-run the relevant pieces if anything in the system has changed since the last walkthrough.

### 1.1 External-readiness gates

- [ ] **Brand name landed.** Repo, Fly app, Vercel project, Sentry project, Resend domain, Telegram bot username all match the chosen brand. Update §intro of this runbook, plus the URL stubs in §1.4 below.
- [ ] **Khmer copy review pass complete.** Translator has signed off on:
  - `frontend/lib/i18n/messages/km.json` — scanner + walk-in + error messages.
  - Help-desk inbox strings (Plan F).
  - Telegram bot replies (`backend/apps/notifications/telegram_*` templates).
  - Public registration form labels for any per-event custom fields the pilot customer adds.
  - Email/QR templates rendered through Resend.
- [ ] **Pilot customer event content reviewed** — name, date, timezone (`Asia/Phnom_Penh`), walk-in capacity (`walkin_capacity` set to the hard cap; `0` = unlimited per `73e5432`), gate names, PIN, expected guest count.

### 1.2 Code + CI gates (T-3 days)

- [ ] **Local main matches origin/main**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git fetch origin --quiet && git log --oneline main..origin/main
  ```

  Expect: empty.

- [ ] **Backend tests + mypy green**

  ```bash
  cd backend && uv run pytest -q 2>&1 | tail -3
  cd backend && uv run mypy apps/ 2>&1 | tail -2
  ```

  Expect: all tests pass; `Success: no issues found in 119 source files` (count drifts up — accept any clean run).

- [ ] **Frontend gates green**

  ```bash
  cd frontend && pnpm install --frozen-lockfile && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
  ```

  Expect: vitest passes, tsc + lint + prettier clean.

- [ ] **GHA `Deploy backend to Fly` green on latest backend-touching commit**

  ```bash
  gh run list --workflow deploy-backend.yml --limit 5
  ```

  Expect: latest backend-touching commit shows `completed success`. Frontend-only commits should not have a deploy-backend run attached.

- [ ] **Vercel deployment matches `origin/main` HEAD**

  ```bash
  pnpm dlx vercel@latest list --scope <scope> | head -3
  ```

  Top row should be `state=Ready` with `meta.githubCommitSha` matching `git rev-parse origin/main`.

### 1.3 Migration + infrastructure gates (T-3 days)

- [ ] **All migrations applied on Fly Postgres** (per Plan F finding #1 — the GHA workflow ships container images but `fly.toml`'s `[deploy] release_command` must apply migrations on each release).

  ```bash
  flyctl ssh console --app <fly-app>
  uv run python manage.py showmigrations | grep -v '\[X\]' | head
  exit
  ```

  Expect: no unapplied migrations. If any are missing, fix `fly.toml` to add `release_command = "python manage.py migrate --noinput"` (or run migrate manually before proceeding).

- [ ] **Append-only audit trigger active**

  ```bash
  flyctl ssh console --app <fly-app>
  uv run python manage.py shell -c "
  from django.db import connection
  with connection.cursor() as cur:
      try:
          cur.execute('UPDATE audit_auditevent SET action=%s WHERE id=%s', ['hack','00000000-0000-0000-0000-000000000000'])
      except Exception as e:
          print('OK blocked:', type(e).__name__, str(e)[:120])
      else:
          print('TRIGGER MISSING')
  "
  exit
  ```

  Expect: `OK blocked: ... audit_auditevent is append-only`.

- [ ] **Celery worker + beat both running** (per `e7d5de7` — beat is a dedicated process group). Confirm beat is alive by tailing logs for the periodic `sweep_preview_imports` job.

  ```bash
  flyctl logs --app <fly-app> | grep -i 'beat\|sweep_preview_imports' | tail -10
  ```

- [ ] **Resend domain verified + outbound email sending** — send a registration to an allow-listed dev address against staging. QR PNG must arrive within 30s.

- [ ] **Telegram bot configured** (if pilot uses it):
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` set as Fly secrets.
  - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` baked into Vercel build (rebuild after change).
  - Webhook registered: `curl https://api.telegram.org/bot$TOKEN/getWebhookInfo` → URL matches and `pending_update_count` < 10.

- [ ] **Sentry project receiving events** — trigger a deliberate 500 (e.g., hit an admin URL that doesn't exist) and confirm the issue lands in Sentry within 60s. If Sentry is quiet for >5 min on a known error, the DSN is misconfigured.

- [ ] **GHA secret `FLY_API_TOKEN` present** — without it the deploy workflow can't ship a hotfix during the event.

### 1.4 Pilot environment URLs (fill in once brand lands)

| Resource | Staging today | Pilot (brand TBC) |
| --- | --- | --- |
| Backend API | `https://eventgate-backend-staging.fly.dev` | `https://<brand>-backend.fly.dev` |
| Dashboard | `https://frontend-five-lovat-94.vercel.app` | `https://<brand>.app` |
| Scanner | `<dashboard>/scanner` | `<dashboard>/scanner` |
| Walk-in display | `<dashboard>/scanner/walkin` | same |
| Sentry | `<TBC>` | `<TBC>` |
| Telegram bot | `@EventgateStagingBot` (or similar) | `@<brand>Bot` |

### 1.5 End-to-end smoke (T-1 day)

Run the **Plan F verification checklist** ([`2026-05-21-plan-f-verification-checklist.md`](./2026-05-21-plan-f-verification-checklist.md)) and **Plan G verification checklist** ([`2026-05-22-plan-g-verification-checklist.md`](./2026-05-22-plan-g-verification-checklist.md)) **Section 4 regression smoke** against the pilot env (not staging):

- [ ] Plan F §§0–9 all pass (no skipped boxes other than the ones explicitly deferred to pre-pilot QA in the findings doc).
- [ ] Plan G §4 regression smoke passes — helpdesk inbox loads, audit page expandable rows toggle, dashboard polling widget updates, email QR still arrives, Telegram CTA present (when bot is enabled), pre-commit hook still rejects format violations.
- [ ] Cross-device re-verification ([`2026-05-22-plan-f-cross-device-reverification.md`](./2026-05-22-plan-f-cross-device-reverification.md) Flows 1 + 2) re-run on pilot env — both Flow 1 (offline conflict) and Flow 2 (walk-in lifecycle) must PASS. Step 2d (claim-past-capacity) is now testable thanks to `73e5432` + `a386ca0`; verify the cap holds under a concurrent two-tab scan attempt at the cap boundary.

### 1.6 Capacity + observability dry run (T-1 day)

- [ ] **Load shape sanity** — for a pilot of N guests with ~3 staff devices, the offline-queue worst case is N × 1 mutation × 1KB ≈ <1MB IndexedDB per device. No special config needed.
- [ ] **Sentry dashboard pinned** for the day-of operator — filter to `environment:prod`, sorted by Last Seen. Mute known noise (the audit trigger blocked-write test exception, if you ran it).
- [ ] **Fly metrics dashboard pinned** — `flyctl dashboard --app <fly-app>` → tab open during event.
- [ ] **Test event from §1.5** archived/deleted so the real pilot is the only live event on the org.

---

## 2. On-call staffing

> First pilot has **two named operators on-call**: the **Door Operator** (physically at the venue, runs the scanner + help-desk inbox) and the **Cloud Operator** (Vinei or a delegate; remote; owns the system response).

### 2.1 Roles

| Role | Owner | Responsibilities | Channels |
| --- | --- | --- | --- |
| **Door Operator** | <name TBC> | Scanner devices, walk-in display, in-person help-desk handling, escalations to Cloud Operator | Phone + Telegram DM (primary). Always-on phone with Telegram open. |
| **Cloud Operator** | Vinei (vinei.ro@squeeze-inc.co.jp) | Backend + frontend health, deploys, rollbacks, Sentry triage, log diving, communication with customer | Laptop tethered to LTE; Sentry alerts → phone; Slack/Telegram backup |
| **Customer Contact** | <customer-side organizer name TBC> | Owns the guest list, makes Approve/Void calls on manual-review items where ID isn't obvious | Walkie / radio to Door Operator |
| **Khmer Translator (on standby)** | <translator name TBC> | Reachable for any string the operator can't interpret on-the-fly | Phone — 1-touch dial only |

### 2.2 Coverage window

- **T-30 min** to **event-end + 30 min**: both Door + Cloud Operator at full attention.
- **Event-end + 30 min** to **+24 h**: Cloud Operator on light watch (Sentry phone alerts) in case post-event audit issues arise.

### 2.3 Pre-event handoff (T-2 h)

- [ ] Door Operator has all scanner devices in hand, PIN known, enrollment codes printed on backup paper.
- [ ] Cloud Operator has terminal open with `flyctl`, `gh`, `pnpm dlx vercel`, and a fresh `eventgate_access` cookie value captured in a scratch file (15-min JWT — will need to refresh).
- [ ] Both have this runbook open in a browser tab.
- [ ] Phone numbers exchanged + test ping confirmed both directions.

---

## 3. Day-of operator scripts

> Scripts are scenarios. Read top-to-bottom; the **bold action** is the single thing to do; the bullets below explain how.

### 3.1 Door Operator scripts

#### S1 — Boot the door (T-30 min)

**Open scanner on each device, enroll, unlock, prime cache.**

1. Visit `<dashboard>/scanner` on each device (or launch the PWA if installed).
2. Tap **Enroll**, paste enrollment code, label device (`Gate 1`, `Gate 2`, …).
3. Tap **Unlock**, enter PIN.
4. On unlock, the scanner pre-caches the guest list into IndexedDB (Plan E). Confirm: scanner header shows "X guests cached" or equivalent.
5. Walk to physical gate position. Confirm cell + Wi-Fi signal. If signal flaky, **stay in scanner — offline mode is fine** (Plan E + F design).

#### S2 — Happy path check-in

**Scan QR → green ENTRY CONFIRMED → guest enters.**

- Sound + green card = success.
- Amber DUPLICATE card = guest already checked in → wave them through, no action.
- Red CONFLICT card = another device already checked them in → **send to help desk** (next script).
- Red NOT FOUND = wrong event or expired QR → check guest's QR is for today's event.

#### S3 — Send to help desk

**On amber/red card → tap "Escalate to help desk" → enter short reason → submit.**

- The escalation creates a `helpdesk_ticket` (Plan F). Cloud Operator gets it in the inbox at `<dashboard>/orgs/<slug>/events/<event-slug>/helpdesk`.
- Tell the guest "one moment, my colleague will help you in" → step them to the side so the queue keeps moving.

#### S4 — Walk-in flow

**Direct walk-in guest to the tablet display → they scan the QR with their phone → fill the info form → checked in.**

- Tablet at `<dashboard>/scanner/walkin` rotates through unclaimed slots automatically.
- Walk-in capacity is enforced server-side (`73e5432` + `a386ca0` — advisory lock on the event scope). If the tablet says "No slots available", the cap is hit; refer to **S5**.

#### S5 — Walk-in cap reached

**Notify the Customer Contact; do not promise entry.** The cap is enforced; trying to bypass it ends in a 4xx on the server. If the customer wants to expand capacity:

1. Cloud Operator opens the dashboard event settings, increases `walkin_capacity`.
2. Tablet display picks up the new slots within ~5s.

#### S6 — Device dies / battery / lost

**Switch to the backup device.** Each gate should have a spare; if not, ask Cloud Operator to issue a new enrollment code from `<dashboard>/orgs/<slug>/events/<event-slug>/devices` — operator types it in on a borrowed device.

### 3.2 Cloud Operator scripts

#### C1 — Help-desk inbox triage (continuous)

**Watch `<dashboard>/orgs/<slug>/events/<event-slug>/helpdesk` with the "Open" chip selected.**

- New ticket lands → click → read the embedded "Server says" + "Original (this device)" payload (Plan F detail pane).
- **Claim** (locks it to you) → talk to Door Operator on radio → pick a resolution:
  - **Approve check-in** — operator overrides; guest enters. Audit chain records the override.
  - **Mark resolved (note)** — duplicate scan, no actual conflict; just note it.
  - **Send to manual review** — needs a customer-side decision (e.g., ID mismatch). Customer Contact reviews → Approve check-in or Mark void.
  - **Mark void** — bad ticket / known fraud.
- After resolution, **Release** is not needed (resolve moves to Resolved chip).

#### C2 — Stats widget pulse (every 10–15 min)

**Glance at `<dashboard>/orgs/<slug>/events/<event-slug>/` widget.**

- Check the 6 tiles: Checked in, Pending, Walk-in QR shown, Manual review, Open escalations, Conflicts (15m).
- If **Conflicts (15m)** spikes red (>2 in 15min), investigate — usually means two operators are scanning the same line.
- If **Manual review** stays amber for more than 10 min, ping the Customer Contact to resolve.

#### C3 — Sentry alert during the event

**Open the issue → read trace → classify.**

- If it's a 4xx (validation, throttle, expected) → ignore.
- If it's a 5xx (genuine server error):
  - One occurrence + no operator report = log it, watch for repeats.
  - >3 occurrences in 5 min OR a Door Operator reports scanner errors → escalate to **§4 escalation paths**.

#### C4 — Audit-row spot check (post-event)

```bash
curl -sS "<api>/orgs/<slug>/events/<event-slug>/audit/" \
  -H "Cookie: eventgate_access=$ACCESS_COOKIE" | python3 -m json.tool | head -80
```

- Confirm row count ≈ (check-ins + walk-ins + escalations + ticket actions). A wildly low count = audit pipeline broken; flag for post-mortem.

### 3.3 Khmer copy fallback

If a guest can't read a string and the operator can't translate on-the-fly:

1. Switch the dashboard / scanner language toggle to **English** for that interaction.
2. If a specific string is the blocker, screenshot it + send to the **Khmer Translator on standby** (S2.1 row 4).
3. Log the string in the post-mortem (§6) so the translator can patch `km.json`.

---

## 4. Escalation paths

> Decision tree, top down. Each row is "if X, do Y". Don't skip steps unless the situation is obvious.

### 4.1 Symptom → first action

| Symptom | Owner | First action | Threshold to escalate further |
| --- | --- | --- | --- |
| One scanner shows red CONFLICT on a known-good QR | Door | S3 — send to help desk | Two+ conflicts in 60s = pattern, see row below |
| Multiple conflicts in <60s | Door + Cloud | Cloud checks `/audit/?action_prefix=checkin.conflict`; Door re-coordinates gates | Audit chain shows correct device split → not a bug; otherwise escalate to §4.2 |
| Scanner won't unlock with PIN | Door | Confirm PIN with Customer Contact; re-enter | Two PIN failures = ask Cloud for the PIN from the event settings |
| Help-desk inbox empty when Door reported escalations | Cloud | Confirm Door is on the right scanner device (escalation needs a "Send to help desk" tap, not just a red card) | If Door confirms they tapped Send and no row arrived → §4.2 |
| Stats widget tiles all zero / "Loading" forever | Cloud | DevTools → Network → check `/stats/` returns 200; if 401, refresh cookie (15-min JWT) | 500 from `/stats/` → §4.2 |
| Walk-in tablet says "no slots" but cap not reached | Cloud | Check `walkin_capacity` on the event; confirm guests in walk-in state count matches cap | Server-side cap looks wrong → §4.2 (model bug) |
| Email QR didn't arrive for a new registration | Cloud | Resend dashboard → check delivery log; confirm address isn't bouncing | Resend domain unverified or Celery worker down → §4.2 |
| Telegram bot stops replying | Cloud | `getWebhookInfo`; if `last_error_message` set → re-set webhook with `setWebhook` | Persistent failure → §4.2 |
| Sentry alert: 500 spike >3 in 5 min | Cloud | Read the trace → identify the endpoint | If endpoint is on the door path (`/scanner/checkins/`, `/helpdesk/tickets/`, `/stats/`, `/walkin/*`) → §4.2 (rollback candidate) |
| Fly app health check failing / 502 from dashboard | Cloud | `flyctl status` + `flyctl logs`; redeploy if a process crashed | Sustained failure >2 min → §5 rollback |
| Database connection refused | Cloud | `flyctl postgres status` (if managed Postgres); restart if stuck | Sustained failure >2 min → §5 rollback + Fly support ticket |

### 4.2 Escalation triggers (when "first action" didn't fix it)

| Severity | Definition | Action |
| --- | --- | --- |
| **P1 — Door blocked** | Scanner check-in path broken for >2 min (no devices working) OR help-desk inbox not receiving tickets OR walk-in flow broken | Cloud Operator initiates §5 rollback **and** posts in customer comms channel ("we are investigating, fall back to paper list for now"). Door Operator manually checks guests against printed list. |
| **P2 — Degraded** | Stats widget stale, audit page slow, Telegram bot down, email QR delayed but core door flows working | Cloud Operator investigates without rolling back; Door continues. Decide rollback if not resolved by midpoint of event. |
| **P3 — Cosmetic / single-guest** | One guest's QR is mangled, one scanner needs re-enrolling, etc. | Door + Customer Contact handle in-line. Log for post-mortem. |

### 4.3 Paper fallback (P1 only)

The pilot customer **must arrive with a printed guest list as paper fallback** — confirm at T-1 day. If the system goes hard down, Door Operator checks guests against the printed list, marks attendance on paper. After recovery, Cloud Operator helps reconcile paper → digital via CSV import (Plan G).

### 4.4 Contact escalation order

1. **Cloud Operator** (Vinei) — first point of contact for all P1/P2.
2. **Fly.io support** (P1, infrastructure) — via support@fly.io / Fly dashboard. Have org + app name ready.
3. **Vercel support** (P1, dashboard down) — via Vercel dashboard.
4. **Resend support** (P2, email delivery) — via Resend dashboard.
5. **Customer Contact** — if the issue is a guest-list problem rather than a software problem.

---

## 5. Rollback procedure

> Two rollback shapes: **soft rollback** (Vercel-only, no DB schema change) and **hard rollback** (backend + DB). Pick based on the cause.

### 5.1 Pre-rollback decision

Before pulling the trigger, answer:

1. **What broke?** Read Sentry + Fly logs for 60 seconds. If unclear, time-box another 60s; don't dive forever.
2. **What was the last deploy?** `gh run list --workflow deploy-backend.yml --limit 5` and `pnpm dlx vercel list | head -5`.
3. **Did a deploy land within the last hour?** If yes, rollback is high-leverage. If no, the bug was latent — rollback may not help.
4. **Is the door blocked now?** If yes, rollback is the cheapest fix even if root cause isn't fully understood.

### 5.2 Soft rollback — frontend only

If the bug is frontend-only (UI broken, scanner won't render, dashboard 500s) **and** the backend logs are clean:

```bash
# Identify the last-known-good Vercel deployment SHA
pnpm dlx vercel@latest list --scope <scope> | head -10
# Promote it to production
pnpm dlx vercel@latest promote <deployment-url> --scope <scope>
```

Or via the Vercel dashboard: **Deployments → click the previous-good deployment → ⋯ → Promote to Production**.

Expect: <60s from click to live.

### 5.3 Hard rollback — backend (no DB migration since last good deploy)

```bash
# List recent releases on Fly
flyctl releases --app <fly-app> | head -10
# Roll back to the previous version
flyctl releases rollback <version> --app <fly-app>
```

Expect: ~90s to redeploy the previous image. The release_command runs again so DB stays in sync.

### 5.4 Hard rollback — backend with DB migration involved

**This is the dangerous case.** A migration that already applied **cannot be safely reverted** mid-event. If you just deployed a release that included a migration, the migration is already applied to the DB.

Decision tree:

- **Migration was additive (new column nullable, new table, new index)** → safe to roll the app code back. Old code ignores the new column. Do §5.3.
- **Migration was destructive (column rename, type change, dropped table)** → old code crashes. Do **NOT** roll back the app; **fix forward** instead (write a hotfix that handles the new schema, ship a new release).
- **You can't tell** → assume destructive. Fix forward.

Hotfix flow (fix forward):

```bash
git checkout main
git checkout -b hotfix/<short-name>
# patch the bug; minimal diff
git commit -m "fix(<scope>): <one-line>"
gh pr create --title "hotfix: <one-line>" --body "P1 during pilot event YYYY-MM-DD"
# get a second pair of eyes if available; otherwise self-approve + merge
gh pr merge --squash
# GHA deploys automatically; watch the run
gh run watch
```

### 5.5 Post-rollback verification

After **any** rollback:

- [ ] Backend health 200: `curl -sS <api>/api/health/`.
- [ ] Frontend loads: open `<dashboard>` in incognito.
- [ ] Scanner unlocks: try one device.
- [ ] One known-good QR scans green.
- [ ] Help-desk inbox loads.
- [ ] Stats widget loads with non-zero values (assuming check-ins have happened).
- [ ] Audit endpoint returns recent rows.
- [ ] Tell Door Operator the system is back; resume normal flow.

### 5.6 Data integrity after rollback

- The append-only audit trigger means rollback **cannot retroactively edit audit rows** — any actions that succeeded during the outage are permanent in the audit chain. This is correct.
- Mutations that were `in_flight` during the outage may have landed once or zero times — the scanner's `target_token` dedupe prevents double-checkins, but **operators should spot-check guests checked in during the outage window** in the audit viewer.

---

## 6. Post-mortem template

> Fill in within **48 hours** of the event end. Save to `docs/postmortems/YYYY-MM-DD-<event-slug>.md`. Even on a clean event, fill out §6.1–§6.4 — the metrics and lessons compound across pilots.

### 6.1 Event summary

- **Date:**
- **Customer / org:**
- **Event slug:**
- **Total registered guests:**
- **Total check-ins (paper + digital):**
- **Walk-ins:**
- **Manual reviews / escalations:**
- **Voided:**
- **Door Operator:**
- **Cloud Operator:**

### 6.2 Phase 1 exit-criteria check (brief §12)

- [ ] Zero data-loss incidents (no audit gaps, no lost check-ins).
- [ ] p95 check-in latency <400 ms online (sample from Fly metrics or Sentry performance).
- [ ] p95 check-in latency <80 ms offline (sample from scanner DevTools timing or local logging).
- [ ] All MVP test cases pass as integration tests (re-run after pilot if any code shipped during the day).

### 6.3 Timeline

Chronological log. Include T-minus setup, the event itself, and the recovery wind-down. Every entry: `HH:MM — what happened — who saw it — what they did`.

### 6.4 What went well

3–5 bullets. Specific to this event, not generic.

### 6.5 What went wrong

For each incident (P1, P2, P3 from §4):

- **Symptom** —
- **Detected by** — (Sentry / operator / customer)
- **Time to detect** —
- **Time to mitigate** —
- **Root cause** —
- **Fix shipped during event?** — (yes/no, SHA if yes)
- **Follow-up tasks** — (file as numbered tasks in `docs/plans/improvement-and-findings-logs.md`)

### 6.6 Khmer + brand follow-ups

- **Khmer strings flagged by operators or guests** — list verbatim (English + the Khmer that was wrong) → translator queue.
- **Brand-name / domain inconsistencies surfaced during the event** — anywhere the old name leaked (email signatures, page titles, etc.) → file rename tasks.

### 6.7 Operator feedback

Door Operator + Cloud Operator each get a paragraph: what surprised them, what was hard, what they'd want changed before the next pilot.

### 6.8 Action items

| Owner | Task | Due |
| --- | --- | --- |
|  |  |  |

Cross-link each action item to a Plan G+ or hygiene wave so it doesn't get lost.

### 6.9 Customer narrative

A one-paragraph summary for the customer: what worked, what we caught and fixed, what we owe them next. Send within 72 h.

---

## Appendix A — Deferred items still in flight as of 2026-05-23

From the cross-device findings ([`2026-05-23-plan-f-cross-device-reverification-findings.md`](./2026-05-23-plan-f-cross-device-reverification-findings.md)) and Plan F verification findings ([`2026-05-22-plan-f-verification-findings.md`](./2026-05-22-plan-f-verification-findings.md)):

- ✅ **`walkin_capacity` model + serializer + hard-cap enforcement** — shipped (`73e5432`, `a386ca0`, `d903464`). Step 2d of cross-device re-verification now testable; re-run in §1.5.
- ✅ **`fly.toml` release_command for migrations** — re-confirm in §1.3.
- ✅ **Celery beat process group** — shipped (`e7d5de7`); confirm beat is alive in §1.3.
- ✅ **`process_csv_import_task` top-level try/except** — shipped (`d3598aa`).
- ✅ **Device-role validation** — shipped (`bf5a72e`).
- ⏳ **Audit-viewer `details_json` rendering UX gap** — operator sees action + token + actor but not the payload. Workaround: curl `/audit/?...` for the payload. Plan G+ hygiene.
- ⏳ **Dual `swr` + `@tanstack/react-query`** — both ship. Not a pilot blocker; pick one in a hygiene wave.
- ⏳ **Pre-commit `prettier --check`** — config gap; CI catches it. Add to `.pre-commit-config.yaml` one-liner.
- ⏳ **iOS install banner on real iPhone** — Vitest covers it; real-device pass deferred. Recommend running on the Door Operator's actual phone during S1 boot.
- ⏳ **`checkin.duplicate` + `checkin.conflict` both emitting on replay** — confirm with the brief that two audit rows is intentional; not a pilot blocker (the help-desk inbox handles both gracefully).
- ⏳ **`ScannerDevice.last_seen_at` not updated on offline-replay sync** — surfaces only in future device-list UI; non-blocking.

## Appendix B — Quick links

- [Plan F verification checklist](./2026-05-21-plan-f-verification-checklist.md)
- [Plan F verification findings (2026-05-22)](./2026-05-22-plan-f-verification-findings.md)
- [Plan F cross-device re-verification methodology](./2026-05-22-plan-f-cross-device-reverification.md)
- [Plan F cross-device re-verification findings (2026-05-23)](./2026-05-23-plan-f-cross-device-reverification-findings.md)
- [Plan G verification checklist](./2026-05-22-plan-g-verification-checklist.md)
- [Improvement + findings log](./improvement-and-findings-logs.md)
- [Brief — `docs/brief.md`](../brief.md)
- [Handoff — `docs/handoff-2026-05-20.md`](../handoff-2026-05-20.md)
