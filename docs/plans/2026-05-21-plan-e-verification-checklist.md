# Plan E — Verification Checklist

> **Purpose:** End-to-end acceptance test for Plan E before declaring the offline scanner pilot-ready and moving on to Plan F. Run this once on staging, top-to-bottom, after the Plan E commit train ships.
>
> **Tested against:** `origin/main` at `cfbb089` (or later). All 18 Plan E implementation commits merged.
>
> **Time budget:** ~60–90 minutes. Sections 0–3 (~20 min) are setup + smoke tests. Sections 5 + 7 (~30 min) are the headline offline + conflict scenarios. The rest is regression + ops confirmations.
>
> **Marking:** check off each `- [ ]` as you complete it. Anything that fails → don't move on; fix or escalate before continuing.

---

## Section 0 — Pre-flight (setup)

**Goal:** Confirm the local + remote state matches the merged Plan E tip before testing.

- [ ] **Pull latest main locally**
  ```bash
  cd /Users/vinei/Projects/eventgate
  git checkout main
  git pull --ff-only
  git log --oneline | head -22
  ```
  Expected: top commit `cfbb089 docs(plan-e): completion log + handoff reset for Plan F`, followed by 18 Plan E commits.

- [ ] **Confirm backend tests green locally**
  ```bash
  cd backend && uv run pytest -q 2>&1 | tail -5
  ```
  Expected: `172 passed` (+ possibly 1 pre-existing concurrency flake — ignore if it reproduces alone on `HEAD~1`).

- [ ] **Confirm backend mypy clean**
  ```bash
  cd backend && uv run mypy apps/ 2>&1 | tail -3
  ```
  Expected: `Success: no issues found in 98 source files`.

- [ ] **Confirm frontend production build green**
  ```bash
  cd frontend && rm -rf .next && pnpm install --frozen-lockfile && pnpm build 2>&1 | tail -5
  ```
  Expected: `[build-sw] precaching N static assets` with N > 0, then `[build-sw] wrote .../public/sw.js`. No errors.

- [ ] **Confirm frontend Vitest green**
  ```bash
  cd frontend && pnpm test 2>&1 | tail -5
  ```
  Expected: `Test Files 4 passed (4)`, `Tests 19 passed (19)`.

- [ ] **Confirm backend deployed to Fly**
  ```bash
  flyctl status --app eventgate-backend-staging
  curl -sS https://eventgate-backend-staging.fly.dev/api/health/
  ```
  Expected: app deployed, health returns `{"status":"ok"}` (or similar live status).

- [ ] **Confirm Vercel auto-deploy fired for `cfbb089`**
  ```bash
  pnpm dlx vercel@latest list --scope vineidev-4891s-projects | head -5
  ```
  Expected: top deployment has `source=git`, `state=READY`, `meta.githubCommitSha` starting with `cfbb089`. If no `source=git` deployment appears, the Vercel auto-deploy fix from Task 0b may need re-applying — see `PLAN_E_TASK_0B_FINDINGS.md`.

- [ ] **Confirm worker Machine restart policy**
  ```bash
  WORKER_ID=$(flyctl machine list --app eventgate-backend-staging | awk '$8=="worker"{print $1}' | head -1)
  flyctl machine status "$WORKER_ID" --app eventgate-backend-staging --display-config | grep -A 2 restart
  ```
  Expected: `"policy": "always"`. Machine state in `flyctl machine list` shows `started`, NOT `standby`.

---

## Section 1 — Backend endpoint smoke tests

**Goal:** Confirm the two new Plan E endpoints (`/guests/sync/`, `/scanner/escalations/`) work against staging, plus the modified `/checkins/` still works.

**Prep:** create a fresh scratch event + a scanner device + a session token. You'll need these for Sections 1–8.

```bash
# Set these once for the session
export ORG_SLUG="acme"          # whatever your test org slug is
export EVENT_SLUG="plan-e-test" # create a fresh event for this run
export BASE="https://eventgate-backend-staging.fly.dev/api/v1"
export DASHBOARD="https://<your-vercel-domain>"  # production or preview URL
```

- [ ] **Create the test event** via the dashboard:
  - Login → `/orgs/<ORG_SLUG>/events/new` → name "Plan E Acceptance", slug "plan-e-test"
  - On `/orgs/<ORG_SLUG>/events/plan-e-test/settings` → set event PIN to `4242`
  - On `/orgs/<ORG_SLUG>/events/plan-e-test/devices` → create a device with role=scanner, label "Gate 1" → **copy the enrollment_code**
  - Create a second device labeled "Gate 2" with role=scanner → **copy that enrollment_code too** (used in Section 7)

- [ ] **Enroll device A from CLI** (instead of opening the PWA — easier scripted):
  ```bash
  export ENROLLMENT_A="<paste enrollment code for Gate 1>"
  RESP=$(curl -sS -X POST "$BASE/devices/enroll/" -H "content-type: application/json" -d "{\"enrollment_code\":\"$ENROLLMENT_A\"}")
  echo "$RESP" | python3 -m json.tool
  export DEVICE_TOKEN_A=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["device_token"])')
  ```
  Expected: 200 response with `device_token`, `device_id`, `event_id`, `event_slug`, `org_slug`, `label="Gate 1"`, `role="scanner"`.

- [ ] **Unlock + get a session token**
  ```bash
  RESP=$(curl -sS -X POST "$BASE/devices/unlock/" \
    -H "content-type: application/json" \
    -H "Authorization: Device $DEVICE_TOKEN_A" \
    -d '{"pin":"4242"}')
  echo "$RESP" | python3 -m json.tool
  export SESSION_A=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["session_token"])')
  ```
  Expected: 200 response with `session_token`, `expires_at` ~8h out, `role="scanner"`.

- [ ] **Public-register a guest "Alice" via the public flow** (UI is fastest):
  - Open `$DASHBOARD/e/$ORG_SLUG/$EVENT_SLUG/register` in an incognito tab
  - Fill name "Alice Test", email a real Resend-allowlisted address, submit
  - Confirm the success page
  - Open the email + grab the **QR PNG** (rendered via `/api/v1/guests/<id>/qr.png?token=…`). Take a screenshot for offline use later.
  - In a separate dashboard tab: `/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/` → confirm Alice appears with `entry_status=registered_not_arrived`
  - Save Alice's raw `entry_token` (visible in the dashboard or by decoding the QR): `export TOKEN_ALICE="<token>"`

- [ ] **`GET /guests/sync/` returns the projection**
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/sync/" \
    -H "Authorization: Bearer $SESSION_A" | python3 -m json.tool
  ```
  Expected: 200 response with `{guests: […], cursor: "…"}`. Alice should be in `guests`. Each row has exactly these 8 fields: `id, entry_token, full_name, email, guest_type, entry_status, info_status, updated_at`. ETag header present.

- [ ] **`GET /guests/sync/` with If-None-Match returns 304**
  ```bash
  ETAG=$(curl -sS -D - "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/sync/" \
    -H "Authorization: Bearer $SESSION_A" -o /dev/null | grep -i '^etag:' | awk '{print $2}' | tr -d '\r')
  echo "etag=$ETAG"
  curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/sync/" \
    -H "Authorization: Bearer $SESSION_A" \
    -H "If-None-Match: $ETAG"
  ```
  Expected: `304`.

- [ ] **`GET /guests/sync/?since=<future>` returns empty**
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/sync/?since=2099-01-01T00:00:00Z" \
    -H "Authorization: Bearer $SESSION_A" | python3 -m json.tool
  ```
  Expected: 200 with `guests: []`.

- [ ] **`POST /scanner/escalations/` writes an audit row**
  ```bash
  curl -sS -X POST "$BASE/scanner/escalations/" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SESSION_A" \
    -d "{\"token\":\"$TOKEN_ALICE\",\"reason\":\"manual_smoke_test\",\"original_payload\":{\"gate\":\"Gate 1\"},\"conflict_payload\":{\"gate\":\"Gate 2\"}}" \
    | python3 -m json.tool
  ```
  Expected: 201 with `{escalation_id: "<uuid>"}`.

- [ ] **Existing `/checkins/` still works (regression)**
  ```bash
  # Don't actually run this with Alice — we want her in registered_not_arrived for Section 4.
  # Instead, register a second guest "Bob" via the public form, then:
  export TOKEN_BOB="<Bob's entry_token>"
  curl -sS -X POST "$BASE/checkins/" \
    -H "content-type: application/json" \
    -H "Authorization: Bearer $SESSION_A" \
    -d "{\"token\":\"$TOKEN_BOB\",\"gate\":\"Gate 1\",\"scanner_label\":\"Gate 1\",\"client_idempotency_key\":\"$(uuidgen)\"}" \
    | python3 -m json.tool
  ```
  Expected: 200 with `status: "success"` + `guest.entry_status: "checked_in"`.

- [ ] **Confirm the audit rows landed** (SSH into Fly + run a Django shell snippet):
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  # inside the container:
  uv run python -c "
  import os, django
  os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
  django.setup()
  from apps.audit.models import AuditEvent
  for r in AuditEvent.objects.filter(action__in=['checkin.success','checkin.help_desk_escalation']).order_by('-occurred_at')[:5]:
      print(r.occurred_at.isoformat(), r.action, r.entry_token[:8], r.actor_id, r.details_json.get('reason',''))
  "
  exit
  ```
  Expected: a `checkin.success` row for Bob + a `checkin.help_desk_escalation` row for Alice with `reason=manual_smoke_test`.

---

## Section 2 — Frontend / Service Worker boot

**Goal:** Confirm the scanner shell loads and the SW + IndexedDB are wired correctly. Run from a **fresh Chrome incognito window** so no prior SW state pollutes.

**Prep:** open `$DASHBOARD/scanner/` in a fresh incognito Chrome window. Open DevTools.

- [ ] **Shell loads**: scanner page renders, header shows "Eventgate Scanner" + "● online" pill.

- [ ] **Service worker registered**:
  DevTools → **Application** → **Service Workers**. Expected: `/sw.js` shows status `activated and is running`. Scope `/`. Source matches the deployed bundle.

- [ ] **SW file is the Workbox bundle** (not Plan D's hand-rolled minimal):
  In the SW row, click "source" or open `$DASHBOARD/sw.js` in a tab. First line should be:
  ```
  // Generated by scripts/build-sw.mjs from sw-src/sw.ts — do not edit.
  ```
  Followed by minified iife code. File size 15–25KB (Plan D's was ~700 bytes).

- [ ] **Precached static assets**:
  DevTools → **Application** → **Cache Storage**. Expected entries: `eventgate-shell-v1` (PWA icons + manifest), `eventgate-next-static-v1` (Next chunks, populated on visit), `workbox-precache-v2-...` (the 60+ static asset precache).

- [ ] **IndexedDB schema exists**:
  DevTools → **Application** → **IndexedDB** → **eventgate_scanner_v1**. Expected three object stores: `guests`, `mutation_queue`, `meta`. All empty at this point (no enrollment yet).

- [ ] **No console errors** on the scanner page boot.

- [ ] **PWA manifest serves correctly**:
  ```
  open $DASHBOARD/manifest.webmanifest
  ```
  Expected: JSON manifest with `name: "Eventgate Scanner"`, `display: "standalone"`, `start_url: "/scanner/"`.

---

## Section 3 — Enroll + unlock + cache prime

**Goal:** The first PIN unlock primes the IndexedDB guest cache so the device can go offline immediately.

- [ ] **Enroll device A from the PWA**:
  `/scanner/enroll` → paste the enrollment code for Gate 1 → submit. Should redirect to `/scanner/unlock`.

- [ ] **Unlock with PIN**:
  `/scanner/unlock` → enter `4242` → submit. Should redirect to `/scanner/scan` (the role landing).

- [ ] **Guest cache is populated**:
  DevTools → **Application** → **IndexedDB** → **eventgate_scanner_v1** → `guests`. Expected: rows for Alice + Bob (+ any other registered guests for the event). Each row has the 8 fields from the projection.

- [ ] **Sync metadata is populated**:
  Same window → `meta` store. Expected: `sync_cursor` row with an ISO timestamp value, `etag` row with a hash string.

- [ ] **localStorage has device + session**:
  DevTools → **Application** → **Local Storage** → `eventgate.scanner.device` and `eventgate.scanner.session`. Both JSON-parseable; session has `expires_at` ~8h in the future.

- [ ] **Camera permission prompt** (or manual entry fallback): on the scan page, either grant camera permission or use the manual-entry fallback. Confirm one path works.

---

## Section 4 — Online happy path

**Goal:** Regression check — the online check-in flow still works exactly as Plan D shipped it.

- [ ] **Scan Bob's QR** (Bob is already checked-in from Section 1's curl). Expected: amber "Already in state checked_in" card.

- [ ] **Scan Alice's QR**. Expected: green ENTRY CONFIRMED card with Alice's name.

- [ ] **Confirm Postgres state** (via the dashboard's guests page or Django shell):
  Alice's `entry_status = checked_in`, `gate = "Gate 1"`, `scanner = "Gate 1"`, `checked_in_at` is recent.

- [ ] **Confirm audit chain**:
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python -c "
  import os, django
  os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
  django.setup()
  from apps.audit.models import AuditEvent
  for r in AuditEvent.objects.filter(entry_token__startswith='<first 8 chars of Alice token>').order_by('occurred_at'):
      print(r.occurred_at, r.action, r.gate, r.scanner, r.actor_id)
  "
  exit
  ```
  Expected: ONE `checkin.success` row for Alice with `gate=Gate 1`, `scanner=Gate 1`.

- [ ] **Re-scan Alice's QR** (online). Expected: amber "Duplicate" card. Postgres unchanged.

- [ ] **Audit gets a `checkin.duplicate` row but NO `checkin.conflict`** (same device + same gate = no conflict):
  Re-run the SQL/Django snippet. Expected: `checkin.success` (first) + `checkin.duplicate` (second). NO `checkin.conflict`.

---

## Section 5 — Offline E2E (headline behavior)

**Goal:** The Plan E core behavior — scan offline, optimistic UI, queue drains on reconnect.

**Prep:** still in the same scanner tab from Section 4. Register a third guest "Carol" via the public form (don't check her in). Note `TOKEN_CAROL`.

- [ ] **Refresh the scanner page so the cache picks up Carol**. Confirm Carol appears in `db.guests`.

- [ ] **Go offline**: DevTools → **Network** → throttling dropdown → **Offline**.

- [ ] **Header reflects offline**:
  - Pill changes to "● offline" (amber).
  - Below-header banner appears: "Working offline — scans will sync when you reconnect."

- [ ] **Scan Carol's QR** (use a printed-out QR or another device's screen). Expected: green optimistic ENTRY CONFIRMED card with Carol's name + Gate 1.

- [ ] **Mutation queue row exists**:
  DevTools → IndexedDB → `mutation_queue`. Expected: 1 row with `status=pending`, `target_token=<Carol's>`, `attempts=0`, `payload.gate="Gate 1"`, `client_idempotency_key=<uuid>`.

- [ ] **Header pill updates**: "● offline — 1 queued".

- [ ] **Banner updates**: "Working offline — 1 scan queued, will sync when you reconnect."

- [ ] **Carol's local cache row flipped optimistically**:
  IndexedDB → `guests` → find Carol. Expected: `entry_status` now `checked_in` locally (so a second scan of her QR offline would show "Duplicate" instead of re-queueing).

- [ ] **Server state UNCHANGED**:
  Open the dashboard's guests page in another (online) tab — Carol still `registered_not_arrived` on the server.

- [ ] **Go back online**: DevTools → Network → throttling → **No throttling**.

- [ ] **Within 30 seconds the queue drains**:
  Watch `mutation_queue` in DevTools. Within ~30s the pending row should:
  - Briefly flip to `in_flight`.
  - Then flip to `status=completed` with `completed_at` set and `server_response` populated.

- [ ] **Header pill returns to "● online"** (green). Banner disappears.

- [ ] **Server state updated**:
  Dashboard guests page now shows Carol as `checked_in` with `gate=Gate 1`.

- [ ] **Server audit chain** for Carol:
  Expected single `checkin.success` row. NO `checkin.duplicate` or `checkin.conflict` (this was a clean offline-then-online drain, not a duplicate).

- [ ] **Idempotency key reuse** (advanced — skip if short on time):
  Triggering the drain twice via `window.dispatchEvent(new Event("online"))` should not produce a second `checkin.success` on the server. The Redis idempotency cache returns the same payload for both calls.

---

## Section 6 — Offline scan of an UNcached token

**Goal:** Confirm the offline path handles unknown tokens gracefully — enqueues + surfaces "will validate on reconnect".

- [ ] **Go offline** (DevTools → Network → Offline).

- [ ] **Type a random token in the manual-entry input** (e.g. `bogus-token-xyz`). Submit.

- [ ] **Card shows**: "Token not in offline cache. Will validate on reconnect."

- [ ] **Mutation queue row exists** with the bogus token, `status=pending`.

- [ ] **Go back online**.

- [ ] **Within 30s the row flips to `status=failed`** with `last_error="token_not_recognised"`.

- [ ] **Server audit** shows a `checkin.token_not_found` row for the bogus token (from `perform_checkin`'s 404 path).

- [ ] **Header pill returns to "● online"** (failed rows don't increment the queued counter — they're only counted in `failed` status, which isn't in the header).

---

## Section 7 — Cross-device conflict signal (the help-desk pipe)

**Goal:** The Plan E architectural headline — a 409 from a *different* device produces a `checkin.conflict` audit row + routes the local mutation to the help-desk lane.

**Prep:** open a SECOND scanner instance in a SEPARATE browser (Firefox, or Chrome with a different profile). Enroll device B as scanner@"Gate 2" using the second enrollment code from Section 1. Unlock with the same PIN.

Pick a new guest for this test — register "Dave" via the public form. Note `TOKEN_DAVE`.

- [ ] **Refresh both A and B's scanner pages** so both see Dave in `db.guests`.

- [ ] **Take Device A OFFLINE** (DevTools → Network → Offline).

- [ ] **On Device A**: scan Dave's QR. Optimistic green card; mutation enqueued.

- [ ] **On Device B (online)**: scan Dave's QR. Server marks Dave `checked_in@Gate 2`. Green ENTRY CONFIRMED card on Device B.

- [ ] **Confirm server state**: Dave `entry_status=checked_in`, `gate=Gate 2`, `scanner=Gate 2`.

- [ ] **Take Device A ONLINE again**.

- [ ] **Within 30s, Device A's queue row flips to `status=conflict`**:
  - DevTools IndexedDB on Device A → `mutation_queue` → Dave's row → `status=conflict`.
  - `server_response` populated with `{status: "duplicate", guest: {gate: "Gate 2", scanner: "Gate 2", entry_status: "checked_in", …}, detail: "Already in state checked_in."}`.

- [ ] **Device A header pill shows "⚠ 1 conflict"** linking to `/scanner/escalations`.

- [ ] **Server audit chain for Dave** (run the Django snippet):
  Expected in order: `checkin.success` (B), `checkin.duplicate` (A), `checkin.conflict` (A) with `details_json.original_gate="Gate 2"`, `details_json.original_scanner="Gate 2"`.

- [ ] **Tap the "⚠ 1 conflict" pill on Device A** → lands on `/scanner/escalations`.

- [ ] **Conflict row renders**:
  - Header "CONFLICT" badge.
  - Guest: "Dave Test".
  - "Original (this device): Gate 1 / Gate 1".
  - "Server says: Gate 2 / Gate 2".
  - Timestamp present.
  - "Send to help desk" button.

- [ ] **Click "Send to help desk"** on the conflict row. Button shows "Sending…" briefly, then the row disappears from the list.

- [ ] **Server audit gets a `checkin.help_desk_escalation` row**:
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python -c "
  import os, django
  os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
  django.setup()
  from apps.audit.models import AuditEvent
  r = AuditEvent.objects.filter(action='checkin.help_desk_escalation').order_by('-occurred_at').first()
  print(r.occurred_at, r.action, r.actor_id, r.entry_token[:8])
  print('details:', r.details_json)
  "
  exit
  ```
  Expected: row with `reason=scanner_offline_conflict`, `original_payload.gate="Gate 1"`, `conflict_payload.gate="Gate 2"`, `device_label="Gate 1"`.

- [ ] **Local mutation row flipped to `escalated`**:
  Device A's IndexedDB → `mutation_queue` → Dave's row → `status=escalated`, `completed_at` set.

- [ ] **Header pill returns to no conflict** ("● online" only, no "⚠ N" pill).

- [ ] **Refresh `/scanner/escalations`**: shows "No conflicts. When an offline check-in clashes…".

---

## Section 8 — Retry exhaustion + Sentry capture

**Goal:** Confirm a mutation that hits 5xx repeatedly (8 retries) ends in `failed` AND emits a Sentry exception.

**Prep:** the Sentry env vars must be set on Vercel for this to actually capture (see Section 10). If they're not set yet, this test still confirms the `failed` status transition; just skip the Sentry-side verification.

This test requires either a flaky-staging-backend setup OR a mock — easiest is to simulate by editing the queued row to have `attempts=7` (one shy of exhaustion) and triggering a drain against a deliberately-broken endpoint.

- [ ] **Go offline + scan another fresh guest "Eve"** to enqueue a mutation.

- [ ] **Edit the queued row via DevTools**: IndexedDB → `mutation_queue` → Eve's row → set `attempts=7`. Save.

- [ ] **Block the checkins endpoint at the SW or network level**:
  Easiest: DevTools → Network → right-click `/api/v1/checkins/` (after triggering a drain) → "Block request URL". Re-enable Network (online) but with that URL blocked.

- [ ] **Trigger a drain**:
  ```js
  window.dispatchEvent(new Event("online"));
  ```

- [ ] **The row should flip to `status=failed`** with `last_error` populated.

- [ ] **Sentry should capture a `mutation_queue_exhausted` exception** (only if `NEXT_PUBLIC_SENTRY_DSN` is set):
  Visit your Sentry project → look for the event within 1 minute. Tags should include `target_token` matching Eve's token.

- [ ] **Unblock the URL** in DevTools and remove Eve's failed row (or leave for Plan F's retry-failed-mutation affordance).

---

## Section 9 — PWA install prompt

**Goal:** Confirm `beforeinstallprompt` is captured + the Install button works.

**Prep:** use a fresh Chrome profile or incognito that has never installed this PWA.

- [ ] **Visit `$DASHBOARD/scanner/` and interact briefly** (Chrome requires some engagement before firing `beforeinstallprompt` — scroll, click something, scan something).

- [ ] **The "Install" button appears in the scanner header**, left of the online/offline pill.

- [ ] **Click "Install"**: Chrome's install prompt should appear with the manifest's app name + icon.

- [ ] **Accept the install**: the PWA is added to the desktop (Chrome) or home screen (Android). The "Install" button disappears.

- [ ] **Launch the installed PWA**: it opens in a standalone window with no browser chrome. Header still shows "Eventgate Scanner".

- [ ] **iOS Safari note**: `beforeinstallprompt` does NOT fire on iOS. The Install button will NOT appear. Document this in onboarding: iOS users must use the share sheet's "Add to Home Screen" manually. (Not a test failure — just a behavior note.)

---

## Section 10 — Sentry instrumentation

**Goal:** Confirm the browser SDK is initialized + captures only on `/scanner/*` routes.

**Prep:** before this section, set the env vars on Vercel:

```bash
# DSN — grab from Fly first:
flyctl secrets list --app eventgate-backend-staging | grep SENTRY_DSN
# Then set on Vercel for production + preview:
pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_DSN production --scope vineidev-4891s-projects
pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_DSN preview --scope vineidev-4891s-projects
# Optional:
pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_ENV production --scope vineidev-4891s-projects
# Then redeploy:
pnpm dlx vercel@latest --prod --yes --scope vineidev-4891s-projects
```

- [ ] **Confirm DSN env vars on Vercel**:
  ```bash
  pnpm dlx vercel@latest env ls --scope vineidev-4891s-projects | grep SENTRY
  ```
  Expected: `NEXT_PUBLIC_SENTRY_DSN` listed for production + preview.

- [ ] **Confirm latest deploy ran with the new env**: visit a fresh scanner page. View source — confirm `NEXT_PUBLIC_SENTRY_DSN` value appears inlined into the JS bundle (Next.js bakes `NEXT_PUBLIC_*` into client bundles).

- [ ] **Trigger a test exception from the scanner page** (DevTools console):
  ```js
  throw new Error("Plan E Sentry smoke test")
  ```

- [ ] **Within 1 minute, the event appears in your Sentry dashboard** (filtered to the right project + the `staging`/`production` env tag).

- [ ] **Confirm Sentry does NOT init on non-scanner routes**:
  Visit `$DASHBOARD/orgs/$ORG_SLUG/events/` (the organizer dashboard). DevTools → Network → filter for "sentry". Expected: ZERO requests to `sentry.io` (the SDK is dynamic-imported only on `/scanner/*` per `lib/scanner/sentry.ts`).

- [ ] **Confirm Sentry does NOT init on public registration**:
  Visit `$DASHBOARD/e/$ORG_SLUG/$EVENT_SLUG/register` (anonymous). Filter Network for "sentry". Expected: ZERO requests.

---

## Section 11 — Operational confirmations

**Goal:** Spot-check the four Plan E operational cleanups from Wave 1.

- [ ] **Vercel auto-deploy still works** (Task 0b fix is durable):
  ```bash
  cd /Users/vinei/Projects/eventgate
  git commit --allow-empty -m "chore: trigger vercel auto-deploy verify"
  git push
  # Wait ~30s
  pnpm dlx vercel@latest list --scope vineidev-4891s-projects | head -3
  ```
  Expected: a fresh `source=git` deployment appearing, reaching `state=READY`. If it appears but fails, check that `rootDirectory` is still set to `frontend` on the Vercel project.

- [ ] **Fly worker still has `restart=always`** (Task 0a fix is durable):
  ```bash
  WORKER_ID=$(flyctl machine list --app eventgate-backend-staging | awk '$8=="worker"{print $1}' | head -1)
  flyctl machine status "$WORKER_ID" --app eventgate-backend-staging --display-config | grep -A 2 restart
  ```
  Expected: `"policy": "always"`. Machine state: `started`.

- [ ] **Prettier still pinned exact** (Task 0c fix is durable):
  ```bash
  cd /Users/vinei/Projects/eventgate/frontend
  grep prettier package.json | head -1
  ```
  Expected: `"prettier": "3.8.3"` (no caret). If a future `pnpm add` widens it back, the format drift returns.

- [ ] **mypy still clean** (Task 0d fix is durable):
  ```bash
  cd /Users/vinei/Projects/eventgate/backend && uv run mypy apps/ 2>&1 | tail -3
  ```
  Expected: `Success: no issues found in 98 source files`. No `# type: ignore` regressions in the 5 Plan B-era files (`apps/common/models.py`, `apps/accounts/managers.py`, `apps/orgs/models.py`, `apps/accounts/services.py`, `apps/accounts/views.py`).

- [ ] **`checkin.conflict` audit row exists from Section 7** (the architectural signal-pipe verification):
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python -c "
  import os, django
  os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
  django.setup()
  from apps.audit.models import AuditEvent
  count = AuditEvent.objects.filter(action='checkin.conflict').count()
  print(f'checkin.conflict rows: {count}')
  "
  exit
  ```
  Expected: ≥ 1 (from Section 7's Dave scenario).

---

## Section 12 — Plan A–D regression smoke (sanity)

**Goal:** Confirm Plan E didn't break any existing path.

- [ ] **Magic-link login** still works (`/login` → request → check email → consume → land on `/`).

- [ ] **Org creation** works (`/orgs/new`).

- [ ] **Event creation** works (`/orgs/<slug>/events/new` with form builder).

- [ ] **Public registration** works (anonymous → `/e/<org>/<event>/register` → 201 + QR email).

- [ ] **QR email arrives via real Celery worker** (not eager):
  ```bash
  flyctl logs --app eventgate-backend-staging | grep -i celery | head -5
  ```
  Expected: log lines showing `celery@worker-<id>: ready` AND task pickups (`Task apps.notifications.tasks.send_qr_email[<id>] succeeded`).

- [ ] **Walk-in display** loads (`/scanner/walkin` on the tablet device — Section 1's Gate 2 device with role `walkin_display`, or create a separate one).

- [ ] **Walk-in claim + info form** work (scan walk-in QR → `/e/<org>/<event>/claim/<token>` → ENTRY CONFIRMED → complete info form).

- [ ] **Pre-reg check-in path (online)** still works for the original Plan D flow (Section 4 covered this).

---

## Section 13 — Final cleanup

- [ ] **Cleanup the Plan E scratch event** (or rename to "Plan E Archive (don't reuse)"):
  Dashboard → `/orgs/<ORG_SLUG>/events/plan-e-test/settings` → archive or delete.

- [ ] **Cleanup test guests** (Alice, Bob, Carol, Dave, Eve) from Postgres if desired. They're scoped to the test event so deleting the event also clears them.

- [ ] **Cleanup local stale build artifact**:
  ```bash
  cd /Users/vinei/Projects/eventgate/frontend && git checkout public/sw.js
  ```
  (After a local `pnpm build`, `public/sw.js` is rebuilt with new asset hashes; revert to the committed version for a clean tree.)

- [ ] **Cleanup merged Plan E worktrees** (locked from the harness — use `--force --force`):
  ```bash
  cd /Users/vinei/Projects/eventgate
  for d in .claude/worktrees/agent-*; do git worktree remove --force --force "$d" 2>&1; done
  for b in $(git branch | grep '^  worktree-agent-' | tr -d ' '); do git branch -D "$b" 2>&1; done
  git worktree list  # confirm only main + the current claude/* worktree remain
  ```

- [ ] **Confirm `git status` clean on main**:
  ```bash
  cd /Users/vinei/Projects/eventgate && git status
  ```
  Expected: `On branch main … working tree clean` (modulo any local sw.js rebuild noise).

---

## Acceptance criteria summary

Plan E is **pilot-ready** when:

1. ✅ Sections 0–4 pass (setup + smoke + happy path).
2. ✅ Section 5 passes (offline scan → reconnect → drain).
3. ✅ Section 7 passes (cross-device conflict → help-desk audit signal).
4. ✅ Section 9 passes (PWA install on Chrome).
5. ✅ Section 11 passes (ops fixes durable).
6. ✅ Section 12 passes (no Plan A–D regression).

Plan E is **pilot-blocker-clear** when:

7. ✅ Section 10 passes (Sentry env vars set + smoke event captured).
8. ✅ Section 8 passes OR is explicitly waived (retry exhaustion is rare; Sentry capture is the meaningful signal — if Section 10 works, Section 8's Sentry side is implicitly proven).

If any of Sections 5, 7, 10, or 12 fail, **stop and fix before Plan F**. Other sections failing → log to `docs/plans/improvement-and-findings-logs.md` and address as Plan F or H follow-ups.

---

## Failure recovery

If something fails partway through:

- **Step 0 (build / tests fail locally)**: pull, `pnpm install --frozen-lockfile`, retry. If still broken, `cd backend && uv sync && uv run pytest` to check backend specifically.
- **SW won't activate**: DevTools → Application → Service Workers → "Unregister" → hard reload (Cmd+Shift+R). Then re-test.
- **IndexedDB schema mismatch** (e.g. you tested an old version first): DevTools → Application → IndexedDB → right-click `eventgate_scanner_v1` → Delete database. Re-enroll + unlock.
- **Mutation queue stuck** (`in_flight` row that never resolved): manually edit it in DevTools to `status=pending`, `next_attempt_at=Date.now()`. Trigger a drain via `window.dispatchEvent(new Event("online"))`.
- **Sentry events not appearing**: confirm DSN env var is on Vercel for the deployment serving this scanner page; redeploy; check Sentry project for the right environment tag.
- **Vercel auto-deploy stuck**: re-run the `rootDirectory` PATCH from `PLAN_E_TASK_0B_FINDINGS.md`.
