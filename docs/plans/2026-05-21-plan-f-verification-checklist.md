# Plan F — Verification Checklist

> **Purpose:** End-to-end acceptance test for Plan F before declaring help-desk + audit + dashboard polling pilot-ready and moving on to Plan G. Run this once on staging, top-to-bottom, after the Plan F commit train ships (24 commits — 19 implementation + 4 Important-finding follow-ups + 1 prettier fix).
>
> **Tested against:** `origin/main` at `ed50eb1` (or later). All Plan F commits merged (everything from `5dcdf7c` onward).
>
> **Time budget:** ~75–105 minutes. Sections 0–1 (~20 min) are setup + backend smoke. Sections 2–5 (~40 min) are the headline UI flows. Section 6 (~15 min) is the scanner carryovers. The rest is ops + regression.
>
> **Marking:** check off each `- [ ]` as you complete it. Anything that fails → don't move on; fix or escalate before continuing.

---

## Section 0 — Pre-flight (setup)

**Goal:** Confirm local + remote state matches the Plan F tip, and the backend GHA deploy actually shipped.

- [ ] **Pull latest main locally**
  ```bash
  cd /Users/vinei/Projects/eventgate
  git checkout main
  git pull --ff-only
  git log --oneline | head -28
  ```
  Expected: top commit `ed50eb1 style(frontend): prettier-format event-stats.ts arrow expression` (or later), with 24 Plan F commits visible above `825b7e6 docs(plan-e): verification complete …`.

- [ ] **Confirm `FLY_API_TOKEN` is set on GitHub repo secrets**
  https://github.com/vineidev/eventgate/settings/secrets/actions → look for `FLY_API_TOKEN`. If missing, set it now (Token: `flyctl auth token`). Without it, the new `Deploy backend to Fly` workflow fails.

- [ ] **Confirm the backend auto-deploy GHA ran green on the Plan F merge push**
  ```bash
  gh run list --workflow deploy-backend.yml --limit 3
  ```
  Expected: latest run completed successfully (`completed success`). If failed → click into the run, diagnose, fix, retry.

- [ ] **Confirm backend tests green locally**
  ```bash
  cd backend && uv run pytest -q 2>&1 | tail -3
  ```
  Expected: `217 passed` (+ possibly 1 pre-existing concurrency flake — ignore if it reproduces alone on `HEAD~1`).

- [ ] **Confirm backend mypy clean**
  ```bash
  cd backend && uv run mypy apps/ 2>&1 | tail -2
  ```
  Expected: `Success: no issues found in 119 source files`.

- [ ] **Install frontend deps** (idempotent, but required if `pnpm-lock.yaml` changed since your last `pnpm install`; otherwise `tsc` fails with `Cannot find module 'swr'` or similar)
  ```bash
  cd frontend && pnpm install --frozen-lockfile 2>&1 | tail -3
  ```
  Expected: `Done in <Ns>` with no errors. If `node_modules/swr` was missing, this will install it.

- [ ] **Confirm frontend Vitest green**
  ```bash
  cd frontend && pnpm test 2>&1 | tail -3
  ```
  Expected: `29 passed (5 files)`.

- [ ] **Confirm frontend prettier + lint + tsc clean**
  ```bash
  cd frontend && pnpm prettier --check . 2>&1 | tail -3
  cd frontend && pnpm tsc --noEmit 2>&1 | tail -3
  cd frontend && pnpm lint 2>&1 | tail -5
  ```
  Expected: all three clean.

- [ ] **Confirm Fly backend is on the new tip**
  ```bash
  flyctl status --app eventgate-backend-staging
  curl -sS https://eventgate-backend-staging.fly.dev/api/health/
  ```
  Expected: app deployed, health 200. (The Plan F backend includes the append-only trigger, `apps.helpdesk`, new endpoints — see Section 1.)

- [ ] **Confirm Vercel auto-deployed the frontend tip**
  ```bash
  pnpm dlx vercel@latest list --scope vineidev-4891s-projects | head -3
  ```
  Expected: top deployment `source=git`, `state=Ready`, `meta.githubCommitSha` matches `ed50eb1` (or whatever your latest push was).

- [ ] **Confirm both `0003` helpdesk migrations + merge `0004` applied on staging**
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python manage.py showmigrations helpdesk
  exit
  ```
  Expected:
  ```
  helpdesk
   [X] 0001_initial
   [X] 0002_backfill_existing_escalations
   [X] 0003_alter_helpdeskticketstate_resolution_action
   [X] 0003_event_nullable
   [X] 0004_merge_20260521_2210
  ```

---

## Section 1 — Backend endpoint smoke tests

**Goal:** Every new Plan F endpoint responds against staging.

**Prep:** create a fresh Plan F scratch event with one organizer + at least one pre-registered guest.

```bash
export ORG_SLUG="acme"          # whatever your test org slug is
export EVENT_SLUG="plan-f-test"
export BASE="https://eventgate-backend-staging.fly.dev/api/v1"
export DASHBOARD="https://frontend-five-lovat-94.vercel.app"
```

- [ ] **Create the test event** via the dashboard (`/orgs/$ORG_SLUG/events/new` → name "Plan F Acceptance", slug `plan-f-test`). On the settings page set PIN `4242`. Create one scanner device "Gate F1" (copy the enrollment code).

- [ ] **Public-register 3 guests** through `/e/$ORG_SLUG/$EVENT_SLUG/register/`:
  - Alice F (use a Resend-allowlisted email so you get the QR)
  - Bob F (Resend-allowlisted)
  - Carol F (any email, just need her in the DB)

  Save Alice's and Bob's raw `entry_token` from the dashboard guest list:
  ```bash
  export TOKEN_ALICE_F="<alice's entry_token>"
  export TOKEN_BOB_F="<bob's entry_token>"
  export TOKEN_CAROL_F="<carol's entry_token>"
  ```

- [ ] **Login as the org owner** in the browser, then capture a JWT cookie value into a curl-friendly form. Easiest: open DevTools → Application → Cookies → copy the `access` cookie value:
  ```bash
  export ACCESS_COOKIE="<paste access cookie value>"
  ```

- [ ] **`GET /helpdesk/tickets/` returns empty list** (no escalations yet)
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/helpdesk/tickets/" \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool
  ```
  Expected: 200 with `{"results": [], "count": 0, "next": null, "previous": null}` and an `ETag` header.

- [ ] **`GET /helpdesk/tickets/` returns 304 on If-None-Match round-trip**
  ```bash
  ETAG=$(curl -sS -D - "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/helpdesk/tickets/" \
    -H "Cookie: access=$ACCESS_COOKIE" -o /dev/null | grep -i '^etag:' | awk '{print $2}' | tr -d '\r')
  echo "etag=$ETAG"
  curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/helpdesk/tickets/" \
    -H "Cookie: access=$ACCESS_COOKIE" \
    -H "If-None-Match: $ETAG"
  ```
  Expected: `304`.

- [ ] **`GET /audit/` returns event-scoped rows**
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/audit/" \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | head -30
  ```
  Expected: 200; `results` array may be empty or contain only registration-side audit rows from the public form. ETag header present.

- [ ] **`GET /stats/` returns zero counts + as_of timestamp**
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/stats/" \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool
  ```
  Expected:
  ```json
  {
    "checked_in": 0,
    "registered_not_arrived": 3,
    "manual_review": 0,
    "displayed": 0,
    "total_walkins": 0,
    "open_escalations": 0,
    "conflicts_recent_15min": 0,
    "as_of": "..."
  }
  ```

- [ ] **`GET /guests/?entry_status=manual_review` returns empty for now**
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/?entry_status=manual_review" \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | head -10
  ```
  Expected: 200 with `results: []` (no manual-review guests yet — will exercise via UI in Section 5).

- [ ] **Per-IP rate limit on `/devices/enroll/` triggers at 11th request**
  ```bash
  for i in $(seq 1 11); do
    curl -sS -o /dev/null -w "%{http_code} " -X POST "$BASE/devices/enroll/" \
      -H "content-type: application/json" \
      -d '{"enrollment_code":"bogus-stress-test"}'
  done; echo
  ```
  Expected: `404 404 404 404 404 404 404 404 404 404 429` — the 11th hits the throttle.

- [ ] **Direct UPDATE on `audit_auditevent` is blocked by the trigger**
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python manage.py shell -c "
  from django.db import connection
  with connection.cursor() as cur:
      try:
          cur.execute('UPDATE audit_auditevent SET action = %s WHERE id = %s', ['hacked', '00000000-0000-0000-0000-000000000000'])
      except Exception as e:
          print('blocked:', type(e).__name__, str(e)[:120])
      else:
          print('NOT BLOCKED — trigger missing!')
  "
  exit
  ```
  Expected: `blocked: InternalError audit_auditevent is append-only (TG_OP=UPDATE)` (or similar `append-only` wording).

- [ ] **Direct DELETE on `audit_auditevent` is blocked by the trigger**
  Same as above but with `DELETE FROM audit_auditevent WHERE id = ...`. Expected: same `append-only` exception.

---

## Section 2 — Help-desk inbox UI (tickets path)

**Goal:** Verify the 5-chip help-desk inbox renders, claim/release/resolve work, audit rows fire.

**Prep:** open `$DASHBOARD/orgs/$ORG_SLUG/events/$EVENT_SLUG/helpdesk` in a fresh Chrome tab. Log in as the org owner.

- [ ] **Page renders with 5 filter chips**: Open, Claimed, Resolved, Manual review, All. Empty state visible ("No items match this filter").

- [ ] **Generate an escalation from the scanner** (manual smoke equivalent to Plan E Section 7's Dave scenario):
  - Open `$DASHBOARD/scanner/` in a different incognito window, enroll Gate F1, unlock with PIN 4242
  - Scan Alice's QR offline (DevTools → Network → Offline) to enqueue → reconnect → on reconnect the queue drains successfully (Alice gets `checked_in` on the server)
  - Now SCAN Alice AGAIN online (same device). She's already checked in → amber Duplicate card
  - For a cross-device CONFLICT (needed to populate the help desk lane): repeat the offline scan with Alice but check her in ONLINE first from a separate device tab on a second enrollment. The mutation from Device A flips to `status=conflict` after reconnect. Open `/scanner/escalations` and tap "Send to help desk".
  - Confirm via curl that a `checkin.help_desk_escalation` audit row exists:
    ```bash
    curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/audit/?action_prefix=checkin.help_desk_escalation" \
      -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | head -20
    ```

- [ ] **Refresh `/helpdesk` — escalation appears under "Open" chip**:
  - Badge: red `open`
  - Reason label: `scanner_offline_conflict` (or whatever `details.reason` carried)
  - Token preview: first 16 chars of Alice's `entry_token` + `…`
  - Timestamp visible

- [ ] **Click the ticket** → detail pane shows: token, scanner device label "Gate F1", "Original (this device): Gate F1 / Gate F1", "Server says: …", Claim button + Textarea + 4 resolution buttons (`Approve check-in`, `Mark resolved (note)`, `Send to manual review`, `Mark void`).

- [ ] **Click "Claim"**: button changes state, ticket moves to "Claimed" chip. Detail pane now shows "Release" instead of "Claim", and "Claimed by <your email>" appears on the list card.

- [ ] **`checkin` audit chain shows the claim row**:
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/audit/?action_prefix=helpdesk." \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | head -20
  ```
  Expected: one row with `action: "helpdesk.ticket_claimed"`, `actor_type: "user"`.

- [ ] **Click "Release"**: ticket returns to "Open" chip; assignee cleared. Audit gets a `helpdesk.ticket_released` row.

- [ ] **Click "Mark resolved (note)"** with notes "verified ID — duplicate scan, fine":
  - Ticket moves to "Resolved" chip
  - Detail shows summary: "Resolved · resolved_with_note" + the notes text
  - Audit gets a `helpdesk.ticket_resolved` row with `details.action="resolved_with_note"` and the notes in `details.notes`

- [ ] **Switch to "All" chip**: 1 row visible (the resolved one). Resolved-state UI in detail pane (no buttons).

- [ ] **Trigger another escalation** (re-do the cross-device conflict with Bob this time) so we have a fresh OPEN ticket to test the manual-review path in Section 5.

---

## Section 3 — Audit viewer

**Goal:** The audit viewer page renders, action_prefix filter works, ETag round-trip works.

- [ ] **Open `$DASHBOARD/orgs/$ORG_SLUG/events/$EVENT_SLUG/audit`**. Expected: page renders with 4 prefix chips (All, Check-ins, Walk-ins, Help desk) + a row count + a table.

- [ ] **"All" chip lists at least these actions**: `checkin.success`, `checkin.duplicate`, `checkin.conflict`, `checkin.help_desk_escalation`, `helpdesk.ticket_claimed`, `helpdesk.ticket_released`, `helpdesk.ticket_resolved` (from Section 2 above).

- [ ] **Click "Help desk" chip**: only `helpdesk.*` rows show. Row count updates to match.

- [ ] **Click "Check-ins" chip**: only `checkin.*` rows show.

- [ ] **Auto-refresh every 10s**: leave the page open; trigger another action (e.g. resolve a ticket from `/helpdesk` in another tab); within ~10s the row count increments without manual reload.

- [ ] **ETag returns 304 when nothing changed**:
  Open DevTools → Network → filter `audit/`. Watch the auto-refresh. After the first request returns 200 + ETag, subsequent requests (within the polling window where state hasn't changed) should be **304** with no body, and the cached body is reused. Verify in the Headers tab: the request sends `If-None-Match: W/"<hash>"`.

---

## Section 4 — Dashboard stats widget

**Goal:** The 6-tile counts widget on the event detail page updates within ~5s of state changes.

- [ ] **Open `$DASHBOARD/orgs/$ORG_SLUG/events/$EVENT_SLUG/`**. Widget renders 6 tiles: Checked in, Pending, Walk-in QR shown, Manual review, Open escalations, Conflicts (15m).

- [ ] **Initial counts match curl baseline**: open `/api/v1/orgs/$ORG_SLUG/events/$EVENT_SLUG/stats/` in another tab — values should match.

- [ ] **Trigger a check-in** (scan a guest's QR in a scanner tab). Within 5-6s the "Checked in" tile increments by 1 in the widget.

- [ ] **Trigger an escalation** (the cross-device conflict flow). "Open escalations" tile goes from N → N+1 within ~5s. "Conflicts (15m)" also increments.

- [ ] **Resolve a ticket** in another tab. "Open escalations" tile decrements within ~5s.

- [ ] **Tone coloring works**:
  - "Manual review" tile shows amber when > 0
  - "Open escalations" tile shows amber when > 0
  - "Conflicts (15m)" tile shows red when > 0
  - All zero tiles render in the default color

- [ ] **ETag 304 round-trip verified for `/stats/`**:
  DevTools → Network → filter `stats/`. Watch the 5s poll cadence. After state stabilizes (no scans / no escalations / no resolutions), subsequent requests should be **304**. If the network panel keeps showing 200 with 400+ byte responses every 5s, the ETag round-trip is broken.

- [ ] **Open `/helpdesk` link** on the event-detail page button row. Confirm the "Help desk" link is present alongside Form / Guests / Devices / Audit / Settings.

---

## Section 5 — Manual-review producer + chip

**Goal:** F+3's "Send to manual review" action moves a guest into `manual_review` state; the chip then surfaces them; the resolve actions work.

**Prep:** you should have one open ticket in `/helpdesk` from Section 2's second escalation (Bob).

- [ ] **Confirm Bob's current `entry_status`** is one of `registered_not_arrived` / `displayed` (NOT `checked_in`, or the transition will be rejected):
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/guests/?entry_status=registered_not_arrived" \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | grep -A 1 "Bob"
  ```
  If Bob is `checked_in`, register a fresh guest "Eve F" via the public form + trigger another escalation against her offline scan. Use Eve's token for the rest of this section.

- [ ] **In `/helpdesk` (Open chip)**: click the open ticket whose underlying guest is still in `registered_not_arrived`. Detail pane opens.

- [ ] **Click "Send to manual review"** with notes "needs human eyes":
  - Button disabled briefly
  - Ticket moves to "Resolved" chip; resolution summary shows "Sent to manual review" (or `escalated_to_manual_review` if the label map didn't ship — either is acceptable, both are functionally equivalent)
  - Underlying guest's `entry_status` flips to `manual_review`

- [ ] **Verify two audit rows fired**:
  ```bash
  curl -sS "$BASE/orgs/$ORG_SLUG/events/$EVENT_SLUG/audit/?action_prefix=helpdesk." \
    -H "Cookie: access=$ACCESS_COOKIE" | python3 -m json.tool | head -40
  ```
  Expected:
  - `helpdesk.ticket_resolved` row with `details.action="escalated_to_manual_review"` and `details.notes="needs human eyes"`
  - `helpdesk.manual_review_escalated` row keyed on the guest, with `new_status="manual_review"`, `previous_status="registered_not_arrived"` (or whatever the prior state was)

- [ ] **Click "Manual review" chip**: 1 row visible — the guest you just escalated. Card shows the guest's full name, email/phone, manual-review badge, timestamp.

- [ ] **Click the manual-review row**: detail pane opens with the guest's name, email, phone, type. Buttons: "Approve check-in" + "Mark void". Notes Textarea.

- [ ] **Click "Approve check-in"** with notes "ID verified, OK to enter":
  - Detail pane updates / item disappears from the Manual review list
  - Guest's `entry_status` flips to `checked_in`
  - Audit row `helpdesk.manual_review_resolved` written with `details.action="approve_checkin"`, `previous_status="manual_review"`, `new_status="checked_in"`

- [ ] **Stats widget reflects the change**: "Manual review" tile decrements, "Checked in" increments — both within 5s.

- [ ] **Repeat with another guest, this time click "Mark void"**: guest moves to `voided`, audit row has `details.action="void"`.

- [ ] **Try the negative path**: open a ticket whose underlying guest is ALREADY `checked_in`, then click "Send to manual review". Expected: 400 error toast / message ("Cannot transition checked_in to manual_review" or similar — the exact error UX may vary). Ticket stays open.

---

## Section 6 — Scanner carryovers (Task 0c–0h)

**Goal:** Spot-check the 6 scanner-side behaviors landed in the Task 0 wave.

### 6a — iOS install banner

- [ ] **From a real iPhone Chrome/Safari**: visit `$DASHBOARD/scanner/`. The amber "iPhone? Tap Share → Add to Home Screen for the full PWA" banner appears below the header.

- [ ] **Tap the `✕`** on the banner: banner disappears.

- [ ] **Refresh the page**: banner stays hidden (dismissed state persists via `localStorage["scanner:ios-install-banner-dismissed"]="1"`).

- [ ] **From Android Chrome / desktop Chrome**: visit `$DASHBOARD/scanner/`. The banner does NOT render (UA gating). The existing "Install" button still works on Android Chrome.

- [ ] **From iOS standalone (Add to Home Screen → launched as PWA)**: banner does NOT render (`display-mode: standalone` matchMedia gating).

### 6b — `in_flight` mutation reaper

- [ ] **In the scanner DevTools** (desktop Chrome, enrolled + unlocked):
  - IndexedDB → `mutation_queue` → manually insert a fake row with `status="in_flight"`, `created_at` set to 10 minutes ago.
  - Reload the page.
  - Watch the row: within a second of reload, `status` should flip to `pending`, `next_attempt_at` updated.

### 6c — Dedupe by `target_token`

- [ ] **Go offline.** Scan the same QR token 3 times in succession (manual entry box works).
- [ ] **Check `mutation_queue`**: only ONE row exists for that token (not 3). `enqueueCheckin` short-circuits the duplicates.

### 6d — Retry-failed affordance

- [ ] **Offline-scan a known-bogus token** (e.g. `bogus-retry-test`). Reconnect. Within 30s the row should flip to `status="failed"`.
- [ ] **Open `/scanner/escalations`**: a "Failed" section renders below conflicts. Bogus row shows with a "Retry" button.
- [ ] **Click Retry**: row resets to `status=pending`, `attempts=0`. The drain will re-attempt — for a bogus token it'll fail again, but the affordance is verified.

### 6e — Online cache update after check-in success

- [ ] **Online, scan Alice F's QR** (she should already be `registered_not_arrived` locally). Green ENTRY CONFIRMED card.
- [ ] **Immediately check IndexedDB `guests` store** → Alice F's row → `entry_status="checked_in"` locally. Plan E only updated the cache on the offline path; Plan F's Task 0g fixed the online path too.

### 6f — Service worker still loads + escalations page still works

- [ ] **SW serving the latest bundle**: DevTools → Application → Service Workers → status `activated and is running`. `/sw.js` is the Workbox bundle.
- [ ] **No regressions** on the scanner shell (header pill, conflict counter, online/offline banner all behave as Plan E).

---

## Section 7 — Operational confirmations

**Goal:** Confirm Plan F's ops + security cleanups are durable.

- [ ] **Backend auto-deploy GHA fires on the next backend touch**:
  ```bash
  cd /Users/vinei/Projects/eventgate
  git commit --allow-empty -m "chore: verify backend GHA fires" -- backend/
  # Note: --allow-empty + path will create a commit that doesn't actually touch backend/.
  # Skip this verification if you don't want a noise commit. Instead, just confirm the
  # workflow ran green on the original Plan F push (see Section 0).
  ```
  Alternative: in the Actions tab of the GitHub repo, confirm the `Deploy backend to Fly` workflow ran successfully on the Plan F merge push.

- [ ] **GHA does NOT fire on a frontend-only push**:
  ```bash
  # Already implicitly verified by the prettier-fix push (ed50eb1) which only touched
  # frontend/lib/event-stats.ts and did NOT trigger deploy-backend.yml.
  gh run list --workflow deploy-backend.yml --limit 5
  ```
  Expected: no run associated with `ed50eb1`.

- [ ] **`/devices/enroll/` rate limit clears after the 1-minute window**:
  Wait ~60 seconds after the Section 1 stress test, then:
  ```bash
  curl -sS -o /dev/null -w "%{http_code}\n" -X POST "$BASE/devices/enroll/" \
    -H "content-type: application/json" -d '{"enrollment_code":"bogus-stress-test"}'
  ```
  Expected: `404` (back to per-request behavior, not 429).

- [ ] **DB append-only trigger survives backend redeploy**:
  Trigger a new backend deploy via the GHA (push any backend commit). After deploy, repeat the direct UPDATE test from Section 1. Trigger should still block.

- [ ] **HelpDeskTicketState backfill ran on staging** (the historic Plan E escalation rows now have state):
  ```bash
  flyctl ssh console --app eventgate-backend-staging
  uv run python manage.py shell -c "
  from apps.helpdesk.models import HelpDeskTicketState
  from apps.audit.models import AuditEvent
  audits = AuditEvent.objects.filter(action='checkin.help_desk_escalation', event__isnull=False).count()
  states = HelpDeskTicketState.objects.count()
  print(f'escalation audit rows with event: {audits}, ticket states: {states}')
  "
  exit
  ```
  Expected: equal counts (one state row per event-bound escalation row). Plan E left 2 audit rows on staging; Plan F's verification adds however many more you generated above.

- [ ] **Pre-commit hook gap is logged** (parking lot — not a fix, just a note):
  Confirm `.pre-commit-config.yaml` still lacks a `prettier --check` hook. Track this in `docs/handoff-2026-05-20.md` parking-lot when you next update the handoff doc.

---

## Section 8 — Plan A–E regression smoke

**Goal:** Confirm Plan F didn't break anything from earlier plans.

- [ ] **Magic-link login** still works (`/login` → request → email → consume → `/`).

- [ ] **Org + event + form-builder pages** load and work.

- [ ] **Public registration** still produces a QR email via the Celery worker (sent through Resend to the allowlisted dev address).

- [ ] **Scanner online check-in path** still works (the Plan D + E happy path).

- [ ] **Walk-in display** still rotates QRs (Plan D `/scanner/walkin` if you have a tablet device, otherwise skip).

- [ ] **Offline scan + reconnect + drain** still works (Plan E Section 5 equivalent — Carol path).

- [ ] **Cross-device conflict signal still produces `checkin.conflict` audit row** (Plan E Section 7 equivalent — the data path Plan F's inbox depends on).

---

## Section 9 — Final cleanup

- [ ] **Cleanup the Plan F scratch event** (or archive — Dashboard → settings).

- [ ] **Cleanup test guests** (Alice F, Bob F, Carol F, Eve F) — deleting the event cascades.

- [ ] **Cleanup merged Plan F worktrees** (from `agent-*` dispatches):
  ```bash
  cd /Users/vinei/Projects/eventgate
  for d in .claude/worktrees/agent-*; do git worktree remove --force --force "$d" 2>&1; done
  for b in $(git branch | grep '^  worktree-agent-' | tr -d ' '); do git branch -D "$b" 2>&1; done
  git worktree list
  ```

- [ ] **Confirm `git status` clean on main**.

---

## Acceptance criteria summary

Plan F is **pilot-ready** when:

1. ✅ Sections 0–1 pass (setup + backend smoke).
2. ✅ Section 2 passes (help-desk inbox: list, claim, release, resolve).
3. ✅ Section 3 passes (audit viewer with action_prefix filter + ETag).
4. ✅ Section 4 passes (stats widget polling + ETag 304 round-trip).
5. ✅ Section 5 passes (manual-review producer via "Send to manual review" + the chip + transition resolve).
6. ✅ Section 6 passes (scanner carryovers, especially iOS banner + reaper + dedupe).
7. ✅ Section 7 passes (ops durability — GHA, throttle, trigger, backfill).
8. ✅ Section 8 passes (no Plan A–E regression).

Plan F is **pilot-blocker-clear** when:

9. ✅ DB append-only trigger blocks direct UPDATE/DELETE attempts (Section 1).
10. ✅ Backend auto-deploy GHA ran green on the Plan F merge push (Section 0).
11. ✅ ETag 304 round-trip is observable in DevTools Network (Sections 3 + 4).

If any of Sections 2, 4, 5, or 7 fail, **stop and fix before Plan G**. Other sections failing → log to `docs/plans/improvement-and-findings-logs.md` and address as Plan G or H follow-ups.

---

## Failure recovery

- **Help-desk inbox shows "Loading…" forever**: open DevTools Network → see if `/helpdesk/tickets/` is returning 401/403 (auth issue), 404 (URL not wired), or 500 (server crash). For 500, check `flyctl logs --app eventgate-backend-staging` for the traceback.
- **Stats widget shows zeros despite real data**: the `/stats/` endpoint may have ETag caching the empty response. Hard-refresh the page (`Cmd+Shift+R`) to bypass the in-memory ETag cache in `frontend/lib/event-stats.ts`.
- **"Send to manual review" 400s**: the underlying guest's `entry_status` doesn't permit the transition. Check the guest's state via the dashboard guests list — only `registered_not_arrived` and `displayed` are valid sources for `manual_review`.
- **Audit viewer empty**: `IsOrgMember` returns 404 if you're not a member of the org. Confirm you're logged in as a user with `OrganizationMembership` to `$ORG_SLUG`.
- **iOS banner doesn't appear**: confirm `display-mode: browser` (not standalone). If you've already added the PWA to Home Screen and re-opened from there, the banner is correctly suppressed.
- **Reaper doesn't fire**: confirm the `in_flight` row's `created_at` is genuinely > 5 minutes old (5 * 60 * 1000 = 300000 ms). The reaper runs once at startup — reload the page after editing the row.
- **Dual `0003` migrations confusion**: `0004_merge_*.py` reconciles them. If `showmigrations` reports both `0003` as `[ ]` (not applied), run `flyctl ssh console` + `uv run python manage.py migrate` to apply.
- **Backend GHA fails with `FLY_API_TOKEN: undefined`**: set the secret at https://github.com/vineidev/eventgate/settings/secrets/actions. Re-run the failed workflow from the Actions tab.
