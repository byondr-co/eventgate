# Plan F — Cross-device re-verification methodology

> **Status:** methodology only — no code changes. Findings get logged into a sibling `docs/plans/2026-05-22-plan-f-cross-device-reverification-findings.md` as you run it.

## What this re-verifies

Two flows that Plan F accepted as implicitly passing but were last explicitly verified at commit `825b7e6` (pre-Plan-F):

1. **`checkin.conflict`** — two scanner instances try to check in the same token within the same offline-replay window; one wins, the other gets a `conflict` result.
2. **Walk-in flow end-to-end** — a tablet displays the live event queue, an operator claims a walk-in slot, and the info-collection form completes the registration.

If either flow regressed during Plan F (helpdesk / audit / dashboard polling changes), we want to know before Plan G headline work lands more change on top.

---

## Setup (one-time, ~10 min)

- [ ] **Backend running**

  ```bash
  docker compose up -d
  ```

  Confirm `http://localhost:8000/api/v1/health/` returns 200.

- [ ] **Frontend dev server**

  ```bash
  cd frontend
  pnpm dev
  ```

  Confirm `http://localhost:3000` loads the login page.

- [ ] **Seed an event with two pre-registered guests**

  ```bash
  cd backend
  <seed-command>
  ```

  Confirm the event has at least:
  - Guest A: pre-registered, status `not_checked_in`, with a printable `entry_token`
  - Guest B: pre-registered, status `not_checked_in`, with a printable `entry_token`
  - Walk-in capacity > 0

- [ ] **Two scanner instances**

  Open two browser windows (or one window + one incognito) at the scanner URL: `/scanner/scan` (after enrolling at `/scanner/enroll`). Enroll each as a separate device — they should land with different `scanner_id` values. Confirm both have offline support (service worker installed).

- [ ] **One tablet display window**

  Open a third window at `/scanner/walkin`.

---

## Flow 1 — `checkin.conflict` (two scanners, same token)

- [ ] **Step 1a: Put both scanners offline**

  In each scanner window: DevTools → Network → "Offline" checkbox. Confirm the UI shows the offline indicator and that scans get queued locally (Dexie `mutation_queue`).

- [ ] **Step 1b: Scan Guest A's token in scanner #1**

  The UI should show "queued" / "pending sync". DevTools → IndexedDB → `mutation_queue`: one new row with `status="pending"`, `target_token=<Guest A's token>`.

- [ ] **Step 1c: Scan Guest A's token in scanner #2**

  Same as 1b. Each scanner has its own IndexedDB; both should now hold an outstanding mutation for the same token.

- [ ] **Step 1d: Bring scanner #1 online, wait for queue drain**

  Uncheck DevTools "Offline" in scanner #1. Watch `mutation_queue` transition `pending` → `in_flight` → row deleted. The scanner UI should show "Checked in" for Guest A.

- [ ] **Step 1e: Bring scanner #2 online**

  Uncheck "Offline" in scanner #2. The replay hits `POST /api/v1/scanner/checkins/` with Guest A's token a second time. Expected:
  - Backend returns 200 with `result: "conflict"` (or 409 — record the exact status).
  - Scanner #2 surfaces the conflict in the UI: banner or list entry tagged "conflict" / "already checked in".
  - An `audit_event` row exists with `action="checkin.conflict"` and `result="warning"` (verify in `/orgs/<slug>/events/<slug>/audit`).

- [ ] **Step 1f: Log findings**

  In `docs/plans/2026-05-22-plan-f-cross-device-reverification-findings.md`, record: backend status code, UI affordance, audit row presence/absence, anything surprising.

---

## Flow 2 — Walk-in flow (tablet display + claim + info form)

- [ ] **Step 2a: Tablet display lists open slots**

  Tablet window at `/scanner/walkin` shows configured walk-in capacity and a live count of unclaimed slots.

- [ ] **Step 2b: Claim a walk-in slot from a scanner**

  From scanner #1 (online): trigger the walk-in path. Pick an unclaimed slot. The tablet display should update within ~5 seconds.

- [ ] **Step 2c: Walk-in guest fills the info form**

  Fill in: full name, email, phone/chat handle. Submit. Confirm:
  - Backend returns 200 with a new guest record (`guest_type="walk_in"`, `entry_status="checked_in"`).
  - An audit row with `action="walkin.info_completed"` lands.
  - Tablet display decrements unclaimed-slot count.

- [ ] **Step 2d: Edge — claim past capacity**

  If the event has 10 walk-in slots and 10 are already claimed, attempting an 11th should be rejected:
  - Backend returns 400 or 409 with a clear error message.
  - Scanner UI surfaces the rejection.
  - Tablet display shows "full" / "no slots available".

- [ ] **Step 2e: Log findings**

  Same findings file as Flow 1.

---

## Pass criteria

- Flow 1: scanner #2 displays "conflict" and an `audit.checkin.conflict` row exists.
- Flow 2: happy path completes, capacity edge rejected, tablet polls correctly.

If either fails, file the regression as a Plan G Task 0 follow-up (NOT as part of the Telegram/CSV headline scope).
