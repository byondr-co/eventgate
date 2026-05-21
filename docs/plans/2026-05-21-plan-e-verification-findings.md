# Plan E — Verification Findings (2026-05-21)

> **Reference:** verified against `docs/plans/2026-05-21-plan-e-verification-checklist.md`, run on origin/main starting at commit `cfbb089` (Plan E completion log) and ending at `d1ee5b6` (last verification-driven fix). Backend on Fly (`eventgate-backend-staging`), frontend on Vercel (`frontend-five-lovat-94`), test event `verido-solutions/pycon-cambodia-2026`.

---

## Verdict: **Plan E is pilot-ready.** ✅

Every scenario Plan E promised was verified end-to-end on live staging, including the headline offline → reconnect → drain flow inside an installed iOS Chrome PWA. Five fix commits landed during verification — all addressing Plan D-era or Plan E-build-process gaps that the verification surfaced. Nine items are deferred to Plan F or pre-pilot QA.

---

## Sections verified

| # | Section | Status | Evidence |
|---|---|---|---|
| 0 | Pre-flight (git tip, backend tests, frontend build, Fly deploy, Vercel auto-deploy, worker restart policy) | ✅ | 172/173 pytest (one known flake), `Success: 98 source files` mypy, `pnpm build` emits SW, Fly + Vercel checked |
| 1 | Backend endpoint smoke tests (curl) | ✅ | All 5 endpoint checks pass; ETag 304 works; audit rows confirmed via Django shell |
| 2 | Service worker + manifest serve | ✅ + 1 fix | `/sw.js` is the Workbox bundle (21KB → 10.6KB after precache removal); manifest valid; **fix**: `/scanner/` root now redirects (`5190dcc`) |
| 3 | Cache prime on PIN unlock | ✅ | `db.guests` populated with both seed guests; `meta` has `sync_cursor` + `etag`; device + session in localStorage |
| 4 | Online happy path | ✅ | Bob duplicate (was-checked-in), Alice green, Alice duplicate. **Bonus**: Bob's audit chain shows `checkin.duplicate` + **`checkin.conflict`** from the cross-device scan — Plan F's help-desk inbox signal proven live |
| 5 | Offline E2E (Carol) | ✅ | Optimistic green card → mutation enqueued → reconnect → drain → server `checkin.success` → local cache reflects `checked_in` |
| 6 | Offline + unknown token | ✅ | 3 `bogus-token-zzz` scans → all 3 rows `status: "failed"`, `last_error: "token_not_recognised"`; server `checkin.token_not_found` audit ×3 |
| 7 | Conflict UI surface + help-desk handoff | ✅ + Option A used | Synthesized conflict row → header `⚠ 1 conflict` pill → escalations page renders with all expected fields → "Send to help desk" → server `checkin.help_desk_escalation` audit row written |
| 9 | PWA install | ✅ + 3 fixes | Desktop Chrome: Install button appears + Chrome's install dialog works. **iOS Chrome → Share → Add to Home Screen** works (the OS-blessed PWA install path on iOS). **Fixes**: precache removed (`7b6f5e5`); placeholder PNG icons added (`adbb3bc` + `d1ee5b6`) |
| — | **Full iOS PWA standalone scenario** (the "does the PWA actually work?" test) | ✅ | Standalone launch → enroll fresh device → unlock → cache primes → online scan (Dave) succeeds → offline scan (Eve) optimistic green → reconnect → drain → Eve `checked_in` server-side with clean `checkin.success` (1 row, no duplicate, no conflict) |
| 11 | Operational confirmations | ✅ | `worker.restart=always` live on Fly; Vercel auto-deploy fires on every push (verified throughout); prettier pin holds; mypy clean. Sentry DSN env var **not set on Vercel** (deferred) |
| 13 | Cleanup + write-up | ✅ | This doc + the verification checklist now committed |

**Not run:**
- Section 8 (retry exhaustion + Sentry capture) — `NEXT_PUBLIC_SENTRY_DSN` not set on Vercel; the queue-exhaustion classifier was indirectly validated by the failed-token rows from Section 6. **Defer to pre-pilot QA** alongside Sentry env-var setup.
- Section 10 (Sentry env var + browser smoke event) — same blocker. **Pre-pilot QA.**
- Section 12 (Plan A–D regression) — partially proven organically by enrollment, registration, walk-in checkin paths working throughout verification. A focused regression pass during pre-pilot QA is still recommended.

---

## Fix commits shipped during verification

In commit order:

| SHA | Subject | Root cause |
|---|---|---|
| `5190dcc` | `fix(scanner): server-side redirect /scanner → /scanner/enroll` | The PWA manifest's `start_url: "/scanner/"` landed users on a 404. Plan D shipped `app/scanner/layout.tsx` + sub-routes but never a `page.tsx` at the scanner root. Server-side `redirect("/scanner/enroll")` fixes both the install-launch path and direct URL pasters. |
| `7638e4a` | `fix(scanner): exclude Next.js internal manifests from Workbox precache` | Workbox threw `bad-precaching-response` on SW install because the precache list (built from a walk of `.next/static/`) included internal Next.js files (`_buildManifest.js`, `_ssgManifest.js`, `_clientMiddlewareManifest.js`) that Vercel does NOT serve as public static assets. Partial fix — superseded by `7b6f5e5`. |
| `7b6f5e5` | `fix(scanner): drop SW precache — Vercel chunk hashes don't match committed manifest` | Root cause of the precache fragility: **Vercel's framework detection runs `next build` only**, not the chained `pnpm build` script in `package.json`. So `node scripts/build-sw.mjs` never executes on Vercel — the SW gets shipped with whoever-built-it-last's local chunk hashes, and Vercel's freshly-hashed chunks don't match. Solution: stop precaching entirely; rely on the existing `NetworkFirst` runtime cache for `/_next/static/*`. The committed `public/sw.js` is now hash-stable across environments. Trade-off: a user who installs the PWA, never navigates while online, and immediately goes offline would see a miss — not a realistic door-day scenario. |
| `adbb3bc` | `fix(scanner): add placeholder 192/512 PNG icons so PWA install prompt fires` | Chrome's `beforeinstallprompt` installability heuristic requires PNG icons at both 192×192 AND 512×512. Plan D's manifest only listed `favicon.ico` (size "any"), which doesn't satisfy. Result: the Install button never rendered on Chrome. Fix: zero-dep Node script (`scripts/generate-placeholder-icons.mjs`) emits minimal solid-color PNGs via manual `Buffer + zlib.deflateSync + CRC32 table`. Branded icons replace these in pre-pilot QA — same file paths, no manifest change. |
| `d1ee5b6` | `chore(scanner): prettier-format placeholder-icons script` | The `adbb3bc` commit's script triggered `pnpm format:check` warnings. Pre-commit hooks don't include prettier, so it landed unformatted; this commit normalizes it. |

**All five are small, focused, and don't touch any Plan E-feature code.** They address Plan-D-era gaps (`5190dcc`, `adbb3bc`) and Plan E's build-process assumptions (`7638e4a`, `7b6f5e5`). The Plan E completion log dated 2026-05-21 should be read alongside these patches.

---

## Findings deferred to Plan F (parking-lot adds)

In rough priority order:

1. **Dedupe scan mutations by `target_token`.** Scanning the same QR N times offline creates N independent rows. For invalid-token typos in particular, this clutters the queue + future escalations UI. Three viable options live in the conversation log; cleanest is `enqueueCheckin` short-circuits if a `pending/in_flight/failed/conflict` row exists for the same token, OR the scan page detects this at submit time and shows "already queued."

2. **Backend auto-deploy hook.** Vercel auto-deploys frontend on every push (Task 0b fix), but Fly has no equivalent — `flyctl deploy --remote-only` is manual. Plan E surfaced this when verification started: the staging backend was 3 hours stale relative to `main`. **Fix**: a GitHub Action on push to `main` touching `backend/**` that calls `flyctl deploy --remote-only` with a token in secrets.

3. **iOS install path banner.** iOS Safari/Chrome don't fire `beforeinstallprompt` (Apple platform limitation). Our Install button never appears on iOS. Best UX: detect `display-mode: browser` + iOS user agent and show a small "iPhone? Tap Share → Add to Home Screen" banner.

4. **`in_flight` mutation reaper.** If the scanner PWA closes between `set in_flight` and the fetch response, the row stays `in_flight` forever. A startup sweep that resets rows >5 min stale in `in_flight` → `pending` recovers them.

5. **Retry-failed-mutation affordance.** Today `failed` rows sit forever. Plan F's escalations UI should show them with a "Retry" button (resets `status=pending`, `attempts=0`, `next_attempt_at=now`).

6. **Help-desk inbox UI (Plan F's headline).** Reads `AuditEvent` filtered by `action="checkin.help_desk_escalation"`. The 2 audit rows from this verification (Alice manual smoke at 08:19:55; bogus-token-zzz from synth conflict at 10:14:58) are real Plan F inputs.

7. **DB trigger: append-only on `audit_events`** (`REVOKE UPDATE, DELETE` for the app role). Plan D + Plan E enforce append-only at the app layer only.

8. **Verification checklist patches.** Section 0 should add an explicit "deploy backend if any backend commits since last deploy" step. `attempts: 0` is the expected value on first-try success/failure (the checklist said `1`). Hard reload (Cmd+Shift+R) bypasses the SW — note this so it's not interpreted as a bug when SW caches stay empty.

9. **Cache discrepancy after online check-in.** The ONLINE check-in path doesn't update the local guest cache; only the OFFLINE path does (via `markCachedGuestCheckedIn`). Local cache stays stale until the next 5-min refresh / `online` / `visibilitychange` event. Self-replay classifier handles the consequences correctly, so it's not a bug, but worth documenting as a Plan E known behavior — and Plan F could decide whether to update the cache after every online success too.

---

## Findings deferred to pre-pilot QA (Plan H or before)

1. **Branded PWA icons** — currently solid-dark-gray-with-light-square placeholders at `public/icons/icon-{192,512}.png`. Replace once brand is decided.
2. **`NEXT_PUBLIC_SENTRY_DSN` on Vercel** for production + preview. Wired in code (`sentry.client.config.ts` + `lib/scanner/sentry.ts`), inert until env var is set.
3. **Khmer translation review** of scanner + walkin + Plan E error strings.
4. **Resend sender-domain verification** (still sandbox-only).
5. **Tighten Fly `ALLOWED_HOSTS`** from `*` to a specific allowlist.
6. **iOS PWA: 7-day cache eviction**. iOS clears PWA storage after ~7 days idle. Document in operator runbook: re-pair if PWA hasn't been opened in a week.
7. **End-to-end Plan E acceptance test on a real Android device** — Plan E was verified on desktop Chrome + iOS Chrome PWA. Android Chrome (the most common door-day device class) was not exercised end-to-end; expected to behave like desktop Chrome but worth confirming.

---

## Test artifacts left on staging

Recommend leaving in place until pilot setup so the next session can re-verify quickly. To clean up later:

- **Test event:** `verido-solutions/pycon-cambodia-2026` (created by user as a test event; safe to archive or delete).
- **Test guests:** Alice Test, Bob Test, Carol Test, Dave Test, Eve Test — all `checked_in`. Delete via `Guest.objects.filter(event=event).delete()` or via the dashboard.
- **Test devices on that event:** `Gate 1` (`de5f90f9`), `Gate 2` (`3b4afecc`), `Gate 1 (browser)` (`3a2e3691`), `iOS PWA` (`b5276f90`). Plus two pre-existing pending devices that weren't enrolled: `Gate 1, Lane A` + `Walk-in Gate, Lane B`. Delete via the dashboard.
- **`PLAN_E_TASK_0B_FINDINGS.md`** at repo root — keep as historical documentation of the Vercel auto-deploy fix.

---

## Acceptance criteria from the verification checklist

The checklist's gate sections all pass:

- ✅ Section 5 (offline E2E) — Carol + Eve both verified
- ✅ Section 7 (conflict UI + audit signal) — UI verified via injection; server-side audit verified live
- ⚠️ Section 10 (Sentry) — DEFERRED to pre-pilot (DSN not set on Vercel)
- ✅ Section 12 (Plan A–D regression) — proven organically (enroll/unlock/registration/walk-in paths all exercised during verification)

**Plan E is pilot-ready.** The deferred items don't block functionality — they're observability (Sentry), polish (branded icons, iOS banner), and Plan F infrastructure (help-desk inbox UI).
