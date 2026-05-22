# Plan F cross-device reverification — findings

**Date run:** 2026-05-23
**Methodology:** [`docs/plans/2026-05-22-plan-f-cross-device-reverification.md`](./2026-05-22-plan-f-cross-device-reverification.md)
**Result:** ✅ Flow 1 PASSED. ✅ Flow 2 PASSED with Step 2d explicitly deferred (model gap, see Task #22).

## Environment

- main HEAD at run start: `c7c62cb` (after the hydration + dev-login + MEDIA fixes).
- Postgres + Redis via docker-compose, Django runserver, Next.js dev server, ngrok for Telegram webhook, Celery worker.
- Event `dev-acme/dev-conf` seeded via `manage.py seed_dev_event` with Alice + Bob as pre-registered guests.
- Two scanner devices enrolled in separate browser sessions, third walkin_display device enrolled in a third browser window.

## Flow 1 — `checkin.conflict` (PASSED)

**Scenario.** Both scanners go offline, scan Alice's token, then come online one at a time. Scanner A wins, Scanner B replays into a conflict.

**Observations.**

- Scanner A came online first → optimistic UI showed green confirmation → on sync the queued mutation landed → backend recorded `checkin.success`.
- Scanner B came online second → its replay hit a guest already checked in → backend emitted **both** `checkin.duplicate` AND `checkin.conflict` (overlapping semantics: duplicate = the token is already used by anyone; conflict = the token is already used by a *different* device).
- Scanner B's UI surfaced the conflict result visibly (operator's words: "Scanner B show conflict (not scanner A)") — Scanner A's UI showed no conflict, which is correct because it was the winner.

**Backend cross-references.** The `checkin.conflict` audit row carries `details_json.original_scanner = "Scanner A"`, `original_gate = "Scanner A"`, `original_checked_in_at = "2026-05-22T17:32:38..."`. That gives the help-desk operator everything needed to resolve the dispute without joining tables.

**Minor observations (non-blocking).**

1. **`checkin.duplicate` AND `checkin.conflict` both emitted** on the same replay. Probably intentional, but worth confirming with the brief next session that two audit rows from one replay is the desired behavior (vs. one row with two facets).
2. **`ScannerDevice.last_seen_at`** did NOT update on Scanner B's offline-replay sync. Likely the sync-queue path doesn't refresh that field. Minor — surfaces as a stale "last seen" timestamp in any future device list UI.

## Flow 2 — Walk-in (PASSED, Step 2d deferred)

**Scenario.** Tablet displays a giant QR. A phone scans → fills info form → tablet auto-cycles to next QR.

**Observations.** The audit chain reads end-to-end as designed:

| Step | Audit action | Guest | Notes |
|---|---|---|---|
| 2a | `walkin.display.create` (Walter slot) | 2dc1c4ae | Tablet poll-issued the QR on first load |
| 2b | `walkin.claim` | 2dc1c4ae | "Phone" (another browser tab) hit the claim URL — backend flipped Walter's `entry_status` to `checked_in` |
| — | `walkin.display.create` (next slot) | e7877fe5 | Tablet auto-cycled to a fresh slot ~2s after Walter's claim |
| 2c | `walkin.info_completed` | 2dc1c4ae | Form submit landed |

Walter's final state: `guest_type=walk_in`, `entry_status=checked_in`, `info_status=info_completed`, `source=walk_in_display`, `checked_in_at` stamped.

**Deferred:**

- **Step 2d (claim past capacity)** is unverifiable because the `Event` model lacks `walkin_capacity` (only has the boolean `walkins_enabled`). Tracked in **Task #22**. Re-run Step 2d after that ships.

**Methodology doc correction worth folding back:** the doc says "claim a walk-in slot from a scanner" implying the scanner UI has a "Walk-in" button. The actual flow is **tablet displays a QR → phone scans QR → info form**. The scanner page (`/scanner/scan`) has no walk-in trigger. Worth updating the methodology doc on its next pass.

## Side bugs surfaced + fixed during this run

1. **CSV upload dialog closed silently** — fixed in `6e93f8a` (redirect to status page).
2. **CSV error report 404** — `MEDIA_URL` / `MEDIA_ROOT` weren't configured; fixed in `33dc875`.
3. **"Back to guests" Button triggered Base UI's `nativeButton` warning** when rendering as a Link — fixed in `33dc875` via `nativeButton={false}`.
4. **Magic-link console output buried in Celery stdout** — added `manage.py dev_login <email>` helper in `0074702`.
5. **`InstallButton` hydration mismatch** — refactored `useInstallPrompt` to `useSyncExternalStore` in `c7c62cb`.
6. **`devices.services.create_device` accepts invalid `role` strings** — caused the cross-device unlock flow to fail until the role was corrected in the DB + localStorage. Filed as Task #26.
7. **Celery worker doesn't auto-reload settings on .py change** — caught silently when the worker held a stale `MEDIA_ROOT` and the import task crashed without flipping status to "failed". Filed as Task #25 with the right fix (top-level try/except on `process_csv_import_task`).

## What this means for the pilot

- The core Plan F flows (offline conflict, walk-in lifecycle) are solid end-to-end.
- Six small bugs landed during verification — none of them rose to "block the pilot," but four (CSV redirect, MEDIA serving, InstallButton hydration, role validation) WOULD have surfaced on a pilot day. Worth running this verification at every wave-cap going forward.
- The `walkin_capacity` gap (Task #22) is the only model-level deficiency between here and pilot readiness. Decide the semantics (0 = disabled vs. unlimited) and ship before the first pilot if the pilot involves a hard capacity ceiling.
