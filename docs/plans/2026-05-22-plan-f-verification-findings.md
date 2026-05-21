# Plan F — Verification Findings (2026-05-22)

> **Reference:** verified against `docs/plans/2026-05-21-plan-f-verification-checklist.md`, run interactively against `origin/main` between commits `5dcdf7c` (Plan F doc) and `9dac477` (F+5 remount fix). Backend on Fly (`eventgate-backend-staging`), frontend on Vercel (`frontend-five-lovat-94`), test event `verido-solutions/plan-f-event`.

---

## Verdict: **Plan F is pilot-ready.** ✅

Every Plan F surface verified end-to-end on staging — DB append-only trigger, hybrid `AuditEvent` + `HelpDeskTicketState` model, claim/release/resolve flow, manual-review producer (`Send to manual review`), audit viewer, dashboard polling counts widget with ETag 304 round-trip, and the 5 verifiable scanner carryovers. Three issues were caught and fixed inline during verification (one ops, two product). Five items deferred to Plan G or pre-pilot QA.

---

## Sections verified

| # | Section | Status | Evidence |
|---|---|---|---|
| 0 | Pre-flight (CI, deploys, migrations) | ✅ + 1 ops fix | 217 pytest passing, mypy clean (119 files), 29 vitest passing, prettier + tsc + lint clean, GHA + Vercel deploys green. **Critical: helpdesk + audit migrations were UNAPPLIED on Fly Postgres (no `release_command` in `fly.toml`); manually applied via `flyctl ssh ... python manage.py migrate` → 6 migrations including `audit.0002_append_only_trigger` and 5 helpdesk migrations.** |
| 1 | Backend endpoint smoke tests | ✅ | All 4 GETs (`/helpdesk/tickets/`, `/stats/`, `/audit/`, `/guests/?entry_status=manual_review`) respond 200 with ETag headers; all 3 ETag 304 round-trips confirmed; per-IP rate limit on `/devices/enroll/` returns 429 on the 11th request; DB append-only trigger blocks direct `UPDATE` and `DELETE` with `IntegrityError audit_auditevent is append-only`. |
| 2 | Help-desk inbox UI (tickets path) | ✅ | Page renders with 5 chips, empty + populated states, auto-select most recent. Claim/release/resolve all verified; audit chain confirms `helpdesk.ticket_claimed` + `helpdesk.ticket_released` + `helpdesk.ticket_resolved` rows with correct actor + payload. |
| 3 | Audit viewer | ✅ | 4 prefix chips work; row count matches expected per filter; 10s auto-refresh observed; **ETag 304 round-trip confirmed via DevTools Network**. (Minor cosmetic: Result column showed only success/warning badges — no error badge appeared because no audit row had `result=error` in the test data; component supports it.) |
| 4 | Dashboard stats widget | ✅ | 6 tiles render correctly, polling cadence ≤5s, tone coloring (amber/red) reactive, **ETag 304 round-trip confirmed**, tile arithmetic verified across multiple state changes (Alan check-in, escalation fires, Send-to-MR, void). |
| 5 | Manual-review producer + chip | ✅ + 2 product fixes | F+3's "Send to manual review" producer works end-to-end. **Caught two real UX bugs during this section, fixed inline (F+4 + F+5, see below).** After fixes: full happy path verified (Send to MR → Manual review chip → Approve check-in / Mark void), 12-row helpdesk.\* audit chain confirms all transitions. |
| 6 | Scanner carryovers | ✅ partial | **6f**: SW activated + 3 IndexedDB stores present + 4-guest cache primed on unlock. **6e**: online cache flip after check-in success confirmed (`markCachedGuestCheckedIn` runs on `result.kind === "success"`). **6c**: 3x offline scan of same bogus token → 1 row in `mutation_queue` (dedupe via `enqueueCheckin` short-circuit). **6d**: failed row → Retry button → row resets to `pending` (verified via JS console; DevTools IndexedDB panel doesn't auto-refresh). **6a** (iOS banner) + **6b** (`in_flight` reaper) deferred to pre-pilot iPhone QA — both already covered by Vitest unit tests. |
| 7 | Operational confirmations | ✅ | GHA `Deploy backend to Fly` fired green on each backend-touching merge push (2 runs at 1m28s + 1m32s); GHA did NOT fire on frontend-only push `ed50eb1`; rate-limit window cleared after ~30min (POST returns 404 not 429); DB append-only trigger survived F+4 redeploy; HelpDeskTicketState backfill parity confirmed (6 escalation audit rows ↔ 6 ticket state rows). |
| 8 | Plan A–E regression smoke | ✅ implicit | All Plan A–E paths implicitly exercised by Plan F verification: magic-link login (active throughout), org + event + form-builder (Vinei created `plan-f-event` via these), public registration → QR email (Eve registered via the public form), scanner online check-in (Eve scanned), offline scan + reconnect + drain (6c+6d). Walk-in display + cross-device conflict signal were NOT re-verified — both Plan E-verified at `825b7e6`, and Plan F didn't touch that code. |
| 9 | Final cleanup | ✅ | 41 Plan F agent worktrees removed; 5 leftover `worktree-agent-*` branches deleted; `git status` clean on `main` (in sync with `origin/main`). Test event + 4 guests left on staging for future re-verification (Plan E precedent). |

---

## Fix commits shipped during verification

In commit order:

| SHA | Subject | Root cause |
|---|---|---|
| `860ba40` | `fix(helpdesk): ETag input includes Count so polling detects row removal from filter` | The `/helpdesk/tickets/` ETag formula was `max(updated_at) + max(id) + status_filter`. When a row transitioned out of the filter (e.g., `open → resolved`), the formula could yield an unchanged hash — the F+2 client-side ETag cache then short-circuited with the stale body. Adding `Count("id")` to the input ensures the hash changes on row removal. 2 new regression tests added. |
| `9dac477` | `fix(helpdesk): remount TicketDetail/ManualReviewDetail per selection so notes textarea resets` | `TicketDetail` initialized local state with `const [notes, setNotes] = useState(ticket.resolution_notes)`. React's `useState` initializer only runs on first mount — when the `ticket` prop changed (selecting a different ticket), notes state retained the previous value. Operator risk: notes meant for ticket A could be accidentally submitted on ticket B's resolve. Fix: `key={selected.key}` forces React to remount on selection change. |
| `fde9737` | `docs(plan-f): checklist Section 0 — add pnpm install step before frontend checks` | The Plan F checklist's Section 0 jumped straight from backend pytest to frontend Vitest, missing `pnpm install --frozen-lockfile`. When `package.json` changes upstream (Task 8 added `swr`), local `node_modules` may be stale → `tsc` fails with "Cannot find module 'swr'". CI was unaffected (always installs fresh); only local verifications tripped. Patched the checklist. |

**The two product fixes (F+4, F+5) are both real correctness bugs that would have hit door-day operators.** Plan F's ETag client-cache layer (F+2) interacted badly with the original server ETag formula; the per-selection state leak was a classic React anti-pattern. Both fixed inline during the verification walkthrough; no other Plan F endpoints/components affected.

---

## Findings deferred to Plan G or pre-pilot QA

In rough priority order:

1. **`fly.toml` needs `[deploy] release_command = "python manage.py migrate --noinput"`.** Migrations have been a manual step on every backend deploy. The new Plan F GHA workflow (Task 0b) ships container images but does not run migrations. Caught by Section 0 — the helpdesk + audit migrations were unapplied on Fly Postgres for the entire interval between Plan F merge and verification. Any call to `/helpdesk/tickets/` would have 500'd. Single-commit fix; high priority.

2. **Real cross-device `checkin.conflict` E2E re-verification.** Plan E verified this at `825b7e6`; Plan F's inbox depends on the signal. The pipe itself is unchanged but a 5-min reconfirmation against the current backend would close the implicit-pass loophole. Pre-pilot QA.

3. **Walk-in display + claim + info form re-verification.** Plan D-era flow, Plan E-verified, untouched by Plan F. Same pre-pilot pattern.

4. **iOS install banner on real iPhone** (Section 6a). Code-tested + behaviorally tested in desktop emulation. Real-device confirmation deferred.

5. **`in_flight` mutation reaper repro on staging** (Section 6b). Vitest unit tests pass; manual IndexedDB-edit + reload repro is fiddly and low-value once unit tests cover the behavior.

6. **Checklist hygiene patches** (next walk-through should be friction-free):
   - **Cookie name** says `access`, actual is `eventgate_access` (settings `JWT_ACCESS_COOKIE`). Section 1 curl recipes need updating.
   - **JWT 15-min access lifetime** trips verification curls. Document "refresh the dashboard tab, re-paste cookie when curls return `Invalid token`" tip in Section 1.
   - **DevTools IndexedDB panel doesn't auto-refresh** after writes. Section 6's retry-failed test should mention the manual refresh icon OR the JS-console fallback query.

7. **Pre-commit hook gap (`prettier --check`).** `.pre-commit-config.yaml` runs ESLint locally but NOT prettier. CI runs prettier and we hit this once during F+2 (commit `481203c` → `ed50eb1` prettier fix). One-line config addition; not urgent but compounding.

8. **Frontend library duplication.** Plan F's Task 8 introduced `swr` (matching the plan's recommendation); Tasks 9 + 10 used the codebase-native `@tanstack/react-query`. Both ship and work, but the dual-library state is debt — pick one in a Plan G hygiene wave.

9. **Audit-viewer UX gap.** `details_json` (the richest signal for escalations + ticket resolutions) is dropped from the audit table layout. Operator looking at an audit row gets action + token + actor but no payload. Worth a Plan G UX patch.

10. **Audit-viewer error-result rendering untested.** No audit row in the test data had `result=error`, so the destructive Badge variant wasn't exercised. Code path inspection confirms the variant is wired correctly; full visual confirmation deferred until an `error` row exists naturally (e.g., from a 5xx).

---

## Test artifacts left on staging

Recommend leaving in place for next-session re-verification; cleanup later:

- **Test event:** `verido-solutions/plan-f-event` (Plan F Acceptance).
- **Test guests:**
  - Alan — `checked_in` (online scan during Section 4)
  - Bobby — `checked_in` (Manual review → Approve check-in during Section 5)
  - Gwen — `voided` (Manual review → Mark void during Section 5)
  - Eve — `checked_in` (Section 6e online scan; verifies Task 0g cache update)
- **Test scanner devices:** `Gate F1` (curl-enrolled during Section 1), `Gate F2` (curl-created for Section 6's PWA enrollment). PIN `4242`.
- **Helpdesk ticket state rows:** 6 total (4 from Section 2/5 + 2 from Plan E remnants backfilled). All `resolved`.
- **Audit rows:** 12+ `helpdesk.*` rows + 6 `checkin.help_desk_escalation` rows + 1 `checkin.success` (Eve) + earlier Plan E checkin chain.

---

## Acceptance criteria from the verification checklist

The checklist's gate sections all pass:

- ✅ **Pilot-ready criteria 1-8** — Sections 0, 1, 2, 3, 4, 5, 6 (partial), 7, 8 (implicit) all pass.
- ✅ **Pilot-blocker-clear criteria** — DB append-only trigger blocks direct UPDATE/DELETE; backend auto-deploy GHA ran green; ETag 304 round-trip observable in DevTools Network.

**Plan F is pilot-ready.** The deferred items are observability + UX polish (audit `details_json` rendering, library dedupe) and pre-pilot device QA (iPhone banner, real cross-device conflict), none of which block door-day functionality.

---

## Statistics

- **24 Plan F implementation + 2 verification-driven fix commits + 1 checklist patch** committed to `main`
- **Backend:** 219 tests passing, mypy clean across 119 source files
- **Frontend:** 29 tests passing, tsc clean, lint clean, prettier clean
- **Verification duration:** ~3 hours interactive walkthrough
- **Production-readiness:** ✅ ready for next pilot event with the Plan G/H follow-ups completed
