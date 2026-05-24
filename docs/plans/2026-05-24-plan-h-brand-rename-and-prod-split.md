# Plan H — brand rename + prod env split (design)

> **Authored:** 2026-05-24 · **Owner:** Vinei (vinei.ro@squeeze-inc.co.jp) · **Anchors:** brief §14 row 1 (Phase-0 brand-name task); pilot launch runbook §1.4 (rename surface) + §intro (external blockers); first-pilot window 2026-06-05 → 2026-07-03 (12 days from today).
>
> **Brand pick:** **Gatethres** (pronounced **GATE-thress**, rhymes with "address"). Coined truncation of *gate + thres(hold)*. Came out of a 9-round candidate search (~85 names checked). **All 10 checked TLDs were truly unregistered** at decision time — `.com .app .io .co .net .me .events .dev .org .ai` — unprecedented in the search; no other candidate cleared more than one TLD. **Zero brand collision** in any WebSearch — no existing "Gatethres" company or product anywhere.
>
> **Scope:** (a) lock in Gatethres pending TM checks; (b) inventory every place "eventgate" appears as a brand-bearing string and rename it; (c) provision a new **prod environment** alongside the existing staging env (which keeps running for shakedown); (d) update runbook + brief + README to reflect the new brand. Implementation waves break out via writing-plans after this design is approved.
>
> **Status:** ⏳ Design phase. TM/handle deep-checks outstanding (§1.2 — expected fast given the coined word has no existing namesakes). Rename + prod-split execution to follow as a plan-execution doc with per-wave worktrees per the user's standard workflow.

---

## 1. Brand pick — Gatethres

### 1.1 Decision rationale

Pulled from a 9-round candidate search covering ~85 names. The full audit matrix is in Appendix A; the headline learnings are:

- **Single-syllable .com / .app is structurally exhausted in late 2026.** Even invented 3-4 letter consonant clusters (Vyx, Klyx, Tryx, Prex, Vrex) all returned LIVE or held-on-marketplace. Round 6 + 6b: 0 truly-free survivors across 16 candidates.
- **Abstract Latin/English nouns** (threshold, gateway, door, line, passage) were claimed in the 90s–2010s. Round 1: 0 candidates clear of both URL conflict and brand-mindshare collision.
- **Coined-word + SaaS-suffix names** (Threshly, Doorlet, Limnio) were available but read as generic-SaaS or folksy. User reaction: rejected on aesthetic grounds.
- **Gate-themed compounds** (rounds 8a–8c) yielded 5 truly-free .apps but most had brand-conflict in the access-control vendor space (Gateline → Twenty CRM at gateline.app; Gateset → GateSet Security Systems; GateLab → London Stock Exchange Group; GateNet → GSX Group; GateLink → Bulgarian IT/cybersecurity firm + additional TLD conflicts surfaced by user's independent check).
- **User-directed round 9** (scangate / walkgate / slidegate / glide / passthrough / gatepass / gatethres): all six "standard" gate compounds blocked by existing competitors (ScanGate® registered, WalkGate active iPhone app, GatePass saturated SaaS category, etc.); **Gatethres — a coined truncation the user surfaced — turned out to be the unicorn**: all 10 checked TLDs free, zero brand collision.

**Why Gatethres:**
- **All 10 checked TLDs are truly unregistered** — `.com .app .io .co .net .me .events .dev .org .ai`. This is unprecedented across the search; no other candidate cleared more than one TLD. Means no acquisition path needed, no premium pricing, no negotiation timelines, no defensive holdings to chase.
- **Zero brand collision** — WebSearch returns no existing company, product, or notable use of "Gatethres" anywhere. Search engines suggest "Gathr" (a different outdoor-products co) as nearest neighbor, confirming the term is genuinely unclaimed.
- **Coined truncation = strongest possible TM filing position.** No real-world dictionary defendant, no existing-brand examiner challenge, no prior-art objection.
- **Maintains the gate/threshold semantic** the product is built around (literal job: handle the threshold-crossing moment at an event gate).
- 9 chars / 2 syllables. Pronounceable in English + Khmer (no consonant cluster issues). Pronunciation locked: **GATE-thress** (rhymes with "address") — confirmed by user 2026-05-24.

**Trade-offs / known risks:**
- **Spelling-from-sound** — "Gatethres" is non-obvious to spell after hearing it once. Customers may write "Gatethress," "Gatethress," "Gatethrace," etc. Mitigation: prominent visual brand presence, "Gatethres dot app" repeated in voice-pitches, possibly defensive-register common misspellings.
- **No dictionary meaning** — brand has to earn its meaning over time. Same trade-off Stripe / Vercel / Notion accept; coined words become meaningful through use.
- **Khmer transliteration not yet confirmed** — Vatana (per runbook §intro Khmer-translator row) reviews during the same Khmer-copy pass as other brand-bearing strings.

### 1.2 Verification — outstanding before lock-in (BLOCKER)

User-driven, ~10–15 min total — expected faster than typical because the coined word has no existing namesakes to filter out. None of the rename mechanics in §2–§5 should begin until these clear.

- [ ] **USPTO TESS** — [tmsearch.uspto.gov](https://tmsearch.uspto.gov) — search "Gatethres" in IC 9 (downloadable software) + IC 42 (SaaS / hosted services). Expect zero hits.
- [ ] **EUIPO eSearch** — [tmdn.org/tmview](https://www.tmdn.org/tmview/welcome) — same query, same classes.
- [ ] **IPOS Singapore** — [ipos.gov.sg](https://www.ipos.gov.sg) — same query (hosting region is Singapore → matters for nominative use).
- [ ] **GitHub org `gatethres`** — check at [github.com/gatethres](https://github.com/gatethres). Expected free.
- [ ] **X/Twitter `@gatethres`** — handle availability. Expected free.
- [ ] **npm `gatethres`** scope — check at [npmjs.com/~gatethres](https://www.npmjs.com/~gatethres) and [npmjs.com/package/gatethres](https://www.npmjs.com/package/gatethres).
- [ ] **Register `gatethres.com` AND `gatethres.app`** at Cloudflare Registrar (~$28/yr total). Defensive registration of other TLDs (`.io`, `.events`, `.dev`) optional — see §6 Q3.

### 1.3 Fallback

If TM check surprisingly surfaces a blocker on Gatethres:

1. Primary fallback: **Slidegate** (round 9 backup — `slidegate.app` truly free, `.com` parked at NameFind domain investor, no SaaS brand collision; "slide gate" is a generic water-engineering term but not a product competitor). Same Plan H mechanics apply with `s/gatethres/slidegate/g` throughout this doc.
2. Secondary fallback: **Soglia** (round 5 survivor — Italian "threshold," `soglia.app` truly free, fully clean).
3. Tertiary fallback: **GateLoop** or **GateNode** (round 8c survivors — truly-free .app, no brand collision).

---

## 2. Rename surface inventory

Repo state at 2026-05-24: **909 occurrences across 46 files**. ~875 of those are in `docs/plans/2026-05-19-plan-a-*` through `docs/plans/2026-05-23-plan-g-*` and the verification checklists / findings — i.e., **historical plan documents that describe what was built under the working name**. **These stay as-is** — they're the audit trail of how we got here, and rewriting them rewrites history. Plan H is the first doc that uses "Gatethres."

The real rename scope is ~35 occurrences across ~30 active files. Inventory below.

### 2.1 Code + config (must rename — breaks otherwise)

| File | Hits | Symbol | Notes |
|---|---|---|---|
| `frontend/lib/scanner/session.ts` | 5 | `eventgate_access` cookie name | **Session-breaking on cutover** — all logged-in users get logged out. Plan: ship rename + clear-and-redirect-to-login flow in same release; or dual-cookie read for a 24h window. |
| `backend/config/settings/base.py` | 5 | `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `JWT_AUTH_COOKIE`, log prefix, app verbose name | Must match `session.ts` exactly. |
| `backend/config/settings/test.py` | 4 | test cookie names | Match base.py. |
| `docker-compose.yml` | 4 | container names, network name | Local-dev only; safe to change. |
| `frontend/sw-src/sw.ts` | 3 | service worker cache key prefix (`eventgate-v1` etc.) | **PWA cache invalidation** — bumping the cache key forces every installed scanner to refetch. Bake this into the same release as the cutover. |
| `frontend/public/sw.js` | 1 | compiled service worker | Regenerated from `sw-src/sw.ts`. |
| `frontend/app/manifest.ts` | 2 | PWA `name` + `short_name` | Affects install banner + home-screen icon label. |
| `frontend/app/layout.tsx` | 1 | `<title>` + meta description | SEO + browser tab. |
| `frontend/app/(app)/layout.tsx` | 1 | dashboard header brand | Visible to operators. |
| `frontend/app/scanner/layout.tsx` | 1 | scanner header brand | Visible to door operator. |
| `frontend/components/auth/login-form.tsx` | 1 | login screen brand string | Visible to org users. |
| `frontend/proxy.ts` | 1 | API base URL fallback string | Probably `https://eventgate-backend-staging.fly.dev` — needs to point at new prod app post-cutover. |
| `frontend/lib/scanner/db.ts` | 1 | Dexie database name (`eventgate-scanner`) | **PWA data loss risk if renamed naively** — Dexie creates a new DB under the new name, leaving offline-queued scans orphaned in the old DB. Either keep the Dexie name as-is (internal — no user impact) or write a one-time migration on first load. **Recommend: keep the Dexie DB name.** |
| `backend/fly.toml` | 1 | `app = "eventgate-backend-staging"` | This is the **staging** app name; prod gets its own `fly.toml` or app override (see §3). |
| `backend/pyproject.toml` | 2 | package `name` + `description` | Cosmetic but visible in `pip list` / Sentry. |
| `backend/config/celery.py` | 1 | Celery app name (`eventgate`) | Used in task queue routing keys; renaming requires draining queue first. |
| `backend/apps/accounts/models.py` | 1 | log line / verbose name | Cosmetic. |
| `backend/apps/accounts/tasks.py` | 1 | log line / email subject prefix | User-visible in magic-link emails. |
| `backend/apps/accounts/management/commands/dev_login.py` | 1 | dev-only utility output | Cosmetic. |
| `backend/apps/orgs/services.py` | 1 | branded string in service layer | Audit for context. |
| `backend/apps/guests/tasks.py` | 2 | email subject lines / QR email body | **User-visible** — change in sync with Resend domain rename. |
| `backend/apps/events/management/commands/seed_dev_event.py` | 2 | dev event slug + name strings | Affects local dev seed; cosmetic. |
| `backend/tests/test_healthcheck.py` | 1 | hostname assertion | Update or remove the brand-coupling. |
| `backend/tests/test_qr_email_task.py` | 3 | email-body brand assertions | Must update with email subject changes. |
| `.github/workflows/backend.yml` | 3 | app-name references in CI logs / annotations | Cosmetic but visible in Actions output. |
| `.github/workflows/deploy-backend.yml` | 1 | `--app eventgate-backend-staging` flag | **Critical** — points the deploy at the prod app post-cutover. See §3. |

### 2.2 Documentation (update with new brand)

| File | Hits | Notes |
|---|---|---|
| `README.md` | 1 | Top-line title + repo description. |
| `docs/brief.md` | 5 | Working-name references throughout. Brief §14 row 1 (the Phase-0 brand task) gets marked **resolved → Gatethres**. |
| `docs/handoff-2026-05-20.md` | 13 | Historical handoff doc — borderline. Leave as-is per "history stays" rule, or add a one-line preamble noting the rename happened on YYYY-MM-DD. |
| `docs/plans/2026-05-23-pilot-launch-runbook.md` | 15 | **Must update.** Runbook §1.4 placeholders (`<brand>-backend.fly.dev`, `<brand>.app`, `@<brand>_bot`, `<brand>-backend-media`) get filled in with `gatethres`. §intro brand-name blocker row goes from ⏳ to ✅. |
| `docs/plans/2026-05-23-pilot-runbook-staging-shakedown-findings.md` | (count above) | Historical findings — leave as-is. |

### 2.3 External-system surfaces (per runbook §1.4 + brief context)

| Surface | Current | New (Gatethres) | Cutover difficulty |
|---|---|---|---|
| GitHub repo name | `eventgate` | `gatethres` | ⚠️ External. GitHub keeps redirects, but everyone with a local clone needs `git remote set-url`. Includes any pre-pilot collaborators. |
| Backend Fly app | `eventgate-backend-staging` (staging only) | `gatethres-backend` (new prod app — see §3) | High — net-new app + DNS + SSL + secrets re-create. |
| Frontend Vercel project | `frontend-five-lovat-94` (staging) | `gatethres-app` (new prod project — see §3) | Medium — net-new project + DNS + env vars. |
| Sentry project slug | `eventgate` | `gatethres` | Low — new prod project recommended (see §3). |
| Resend domain | current sender on staging | `mail.gatethres.app` (or `mail.gatethres.com`) | Medium — DNS records (DKIM, SPF, return-path), domain reverification cycle. |
| Telegram bot username | `@eventgate_bot` | `@gatethres_bot` | Low — BotFather supports username rename (token stays). Webhook URL must be re-pointed via `setup_telegram_webhook` against the prod backend (per runbook §1.3). |
| Tigris bucket | `eventgate-backend-staging-media` | `gatethres-backend-media` | Medium — new bucket; no data to migrate if prod env starts fresh. |
| Domain (apex) | none | `gatethres.app` → Vercel; `api.gatethres.app` → Fly. Optionally `gatethres.com` as redirect-only or primary. | Medium — DNS provisioning + SSL cert issuance. |

### 2.4 Khmer strings touching the brand

Khmer translator (Vatana) is already on the queue for `frontend/lib/i18n/messages/km.json` per runbook §intro. Brand-bearing strings (login screen, email templates, PWA install banner, Telegram bot replies) need re-translation in sync with the brand cutover. **Specifically confirm Khmer transliteration of "Gatethres" (pronounced GATE-thress)** — this is brand-defining and worth getting right with Vatana on the same review pass.

---

## 3. Prod environment split

Today only **staging** infrastructure exists. The pilot needs a separate prod env so test data, broken deploys, and operator experiments don't bleed into the customer-facing flow.

### 3.1 What gets a prod twin

| Resource | Staging (keep) | Prod (new) | Provisioning notes |
|---|---|---|---|
| Fly backend app | `eventgate-backend-staging` | `gatethres-backend` | Singapore region (`sin`), same `fly.toml` template, same secrets but with prod values. Use `fly launch --copy-config` from staging. |
| Vercel frontend | `frontend-five-lovat-94` | `gatethres-app` (or `gatethres`) | Production branch = `main`. Connect to same GitHub repo (renamed). Set `NEXT_PUBLIC_*` env vars to point at `api.gatethres.app`. |
| Postgres | Neon staging branch | Neon prod branch | Fresh empty DB — no migration of staging test data. Apply all migrations via `release_command` on first deploy. Run audit trigger seed (per runbook §1.3). |
| Redis | Upstash staging | Upstash prod | Same Singapore region. Connection URL into Fly secrets. |
| Sentry | personal-org / `eventgate` (verified 2026-05-23) | personal-org / `gatethres` (new project) | New project. Prod env tag = `prod`. Pre-emptively mute audit-trigger-blocked-write test exceptions. Separate DSN. |
| Resend | staging sender | sender from `mail.gatethres.app` | New domain in Resend dashboard; add DNS to `gatethres.app`. Send a test QR to a deliverable address before pilot. |
| Tigris (media bucket) | `eventgate-backend-staging-media` | `gatethres-backend-media` | New bucket. Bucket creds into Fly secrets. CSV imports start fresh. |
| Telegram bot | `@eventgate_bot` (verified 2026-05-23) | `@gatethres_bot` | Two options: (a) rename existing bot via BotFather (token preserved, username changes) and point webhook at prod backend; (b) create a new bot for prod. **Recommend (a)** — preserves the bot identity and any allow-listed test chats. |
| Domain DNS | n/a | `gatethres.app` → Vercel; `api.gatethres.app` → Fly. Optionally `gatethres.com` → Vercel (apex 301 to `.app` or vice versa). | Cloudflare DNS (default with Cloudflare Registrar) or Vercel-managed DNS. Open question — see §6. |
| GitHub Actions deploy | targets `eventgate-backend-staging` | targets `gatethres-backend` | `.github/workflows/deploy-backend.yml` `--app` flag changes. |

### 3.2 Secrets to provision fresh on prod

Per runbook §1.3, the staging Fly app has:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`
- `FLY_API_TOKEN` (set in GitHub Actions, not Fly itself)
- `DATABASE_URL` (Neon)
- `REDIS_URL` (Upstash)
- `SENTRY_DSN`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `TIGRIS_*` (bucket access keys)
- Django `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`

All must be re-issued / re-pointed for the prod app. Some (`TELEGRAM_WEBHOOK_URL`) depend on the prod domain being live first (see ordering, §4).

### 3.3 What stays on staging

Staging keeps running indefinitely. It is the proving ground for:
- Pre-deploy shakedowns before the next pilot
- Plan F + Plan G regression smoke
- Cross-device re-verification
- Khmer copy review iterations
- Any work where breaking the env is fine

Staging URLs **must not** appear in any pilot-facing materials post-cutover. The runbook's §1.4 placeholder rows fill in with prod URLs only.

### 3.4 Database isolation guarantees

- Prod DB starts empty. Audit trigger applied on first deploy via migrations.
- Staging data **does not** migrate. (Why: staging has manual test events, fake guests, simulated conflicts — all of which would pollute the first-pilot post-mortem metrics.)
- The Click Cam's real event lives only on prod DB.

---

## 4. Ordering, risk, and reversibility

### 4.1 Wave ordering (writing-plans will expand)

1. **Wave 0 — User-side TM + handle checks (BLOCKER).** Nothing else starts until §1.2 clears. Expected fast (~10–15 min) since Gatethres has no existing namesakes.
2. **Wave 1 — Domain + handle land-grab.** Register `gatethres.com` + `gatethres.app` at Cloudflare Registrar. Optionally claim defensive TLDs (`.io`, `.dev`, `.events`) per §6 Q3. Reserve GitHub org `gatethres`, X handle `@gatethres`, npm namespace `gatethres`.
3. **Wave 2 — Prod infrastructure provisioning.** New Fly app, new Vercel project, new Neon branch, new Upstash, new Sentry project, new Resend domain, new Tigris bucket. None of this touches the existing staging env.
4. **Wave 3 — DNS + SSL.** Point `gatethres.app` and `api.gatethres.app` at the new resources. Optionally configure `gatethres.com` (apex redirect or primary). Wait for SSL issuance and cache propagation.
5. **Wave 4 — Telegram bot rename + webhook re-point.** BotFather rename + `setup_telegram_webhook` against the new prod backend URL.
6. **Wave 5 — Repo internal rename.** Find + replace `eventgate` → `gatethres` in active code/config (see §2.1). Bump service worker cache key + Dexie keeps its name (§2.1 note). Run full backend pytest + frontend vitest + tsc + lint locally. Open as a PR to main.
7. **Wave 6 — Documentation rename.** README, brief §14 row 1, runbook §1.4 + §intro. (Historical plans + handoffs left untouched.)
8. **Wave 7 — GitHub repo rename.** `eventgate` → `gatethres` on the GitHub side. Local `git remote set-url` + any collaborator notification. Update GitHub Actions `--app` flag to the new prod app.
9. **Wave 8 — Khmer brand-bearing strings.** Vatana re-translation packet covers the new brand strings (login, email subject lines, PWA install, Telegram replies) **plus the Khmer transliteration of "Gatethres" itself**.
10. **Wave 9 — Prod env smoke.** Run runbook §1.5 Plan F + Plan G regression smoke against the prod env (not staging). Spin up a throwaway `gatethres-acceptance` org + event for the smoke; archive/delete after.
11. **Wave 10 — Runbook + Plan H closeout.** Mark `Brand name` row in runbook §intro from ⏳ to ✅. Capture any leaked staging URLs / leftover strings in §6.6 of the runbook.
12. **Pilot launch.** First-pilot event runs on prod (`gatethres.app`, `api.gatethres.app`).

### 4.2 Critical-path risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TM filing surfaces a conflict on Gatethres | Very low — coined word with zero existing usage | High (rollback to Slidegate) | Run §1.2 verification BEFORE any rename ships. Reserve fallback handles cheaply now. |
| DNS / SSL provisioning takes > 1 day | Med | High (slips Wave 9 smoke; pushes against pilot date) | Provision DNS on Wave 1 alongside domain registration, not Wave 3. Cloudflare-issued SSL is fast (~5 min). |
| Telegram bot rename loses webhook silently | Med | Medium (Telegram path goes dark; not P1 if email-QR fallback works) | Per runbook §1.3 lesson: always re-run `setup_telegram_webhook` and verify with `getWebhookInfo` showing the new URL + `pending_update_count < 10`. |
| Cookie rename logs everyone out mid-pilot prep | High (by design — see §2.1) | Low if scheduled, High if accidental | Ship cookie rename in Wave 5 (well before pilot day). Communicate in advance to anyone testing. Or: dual-read for 24h post-cutover. |
| Service worker cache key bump fails to invalidate on operator devices | Med | High (operators stuck on stale PWA mid-pilot) | Cache-key bump forces refetch; verify on Vatana's actual device during T-1 day smoke (runbook §1.5). |
| Repo rename breaks anyone with local clones | High | Low (GitHub keeps redirects; affected users `git remote set-url`) | Single-line note in handoff doc + Telegram DM to any active collaborators. |
| 909-occurrence find/replace hits historical plans we wanted to leave alone | Med | Medium (rewrites history) | Use targeted file lists in §2.1 + §2.2 — do not run a repo-wide `sed`. Each wave's PR diff gets eyeballed before merge. |
| Brand mispronunciation drift (GATE-threez vs GATE-thress) | Med | Low–medium (brand inconsistency) | Pronunciation locked: **GATE-thress**. Surface in onboarding docs, README, and Vatana's Khmer transliteration packet. Add a one-line pronunciation note on the marketing-page-equivalent (deferred but noted). |
| Pilot date 2026-06-05 — only 12 days from today (2026-05-24) — runbook risk line says anything not shipped by 2026-05-29 is risk-bearing | Real | High (delayed pilot) | Sequence aggressively. Waves 0–2 can run in 1 day if TM clears fast. Waves 3–7 in 2–3 days. Waves 8–10 in the remaining 3–4 days. Slack: ~3 days if things go right. |

### 4.3 Reversibility

| Action | Reversible? | Notes |
|---|---|---|
| Register `gatethres.com` + `.app` | Effectively no (sunk ~$28) | Cheap. |
| Defensive TLD registrations (if pursued) | Effectively no (sunk ~$10–25/TLD) | Optional per §6 Q3. |
| Provision new Fly app | Yes | `flyctl apps destroy gatethres-backend` reverses. |
| Provision new Vercel project | Yes | Delete from dashboard. |
| Provision new Neon branch | Yes | Delete branch. |
| New Sentry project | Yes | Delete project. |
| New Resend domain | Yes | Remove from dashboard; DNS records can stay. |
| New Tigris bucket | Yes | Empty + delete. |
| BotFather rename `@eventgate_bot` → `@gatethres_bot` | Yes (within Telegram limits — they allow renames; tokens persist) | Old username may be reclaimable. |
| Repo rename `eventgate` → `gatethres` on GitHub | Yes | GitHub keeps redirects on both old and new. |
| String find/replace in code | Yes via `git revert` | Each wave is its own PR. |
| Runbook + brief rewrites | Yes via `git revert` | Documentation is repo-managed. |
| Khmer re-translation | Yes (revert km.json) | But pays a translator-time cost. |

---

## 5. Out of scope

- **Custom domain branding beyond `gatethres.app`/`.com`.** Use of `.io` / `.events` / etc. deferred unless §6 Q3 selects defensive-claim.
- **Brand identity (logo, color palette, type system).** Separate workstream, post-pilot.
- **Marketing site / landing page.** Plan I or later.
- **Legal: corporate entity name change.** Out — that's Squeeze Inc.'s decision separate from the product brand.
- **Migrating staging data into prod.** Out by design — prod starts clean (§3.4).
- **Renaming the local Dexie DB.** Out — internal name, no user impact (§2.1 note).
- **Mass-rewriting historical plan documents.** Out — they're the audit trail (§2 intro).

---

## 6. Open questions for the user

1. **Domain registrar preference?** Cloudflare Registrar (wholesale pricing, no upsell, includes Cloudflare DNS — recommend), Namecheap, Porkbun, or GoDaddy.
2. **Sentry: rename existing project or create new prod project?** Recommend new prod project — clean signal-to-noise from day one; staging keeps eating its own noise.
3. **Defensive TLD claim?** All 10 checked TLDs are free. Options: (a) register only `.com` + `.app` (~$28/yr — minimum viable); (b) register `.com + .app + .io + .dev` (~$80/yr — covers common typosquatting + alt-positioning); (c) register all 10 (~$200/yr — maximum defensive). Recommend (b) for a SaaS brand at this stage.
4. **Use `gatethres.com` as primary or as redirect to `.app`?** Recommend `.app` as primary (Vercel default, modern SaaS norm) with `.com` 301-redirecting to `.app`. `.com` exists for credibility / email signature use.
5. **Rename `eventgate-backend-staging` Fly app post-cutover, or leave it?** Recommend leave it — staging name doesn't need to match brand; renaming risks downtime on a working env.
6. **Telegram bot: rename existing `@eventgate_bot` or create new `@gatethres_bot`?** Recommend rename — preserves bot token and any allow-listed test chats.
7. **Cookie rename cutover style — atomic with logout, or dual-read for 24h?** Recommend atomic with logout — simpler; all logged-in users get redirected to login on next request. Pilot operators re-enroll devices fresh anyway.
8. **Wave granularity for execution plan — one PR per wave, or batched waves?** Per user's per-task worktree workflow, recommend one PR per wave (parallelizable where independent).

---

## 7. Acceptance criteria

Plan H is done when **all of the following** hold:

- [ ] §1.2 TM/handle deep-checks all green (or fallback to Slidegate / Soglia executed).
- [ ] `gatethres.app` resolves to the prod dashboard with valid SSL.
- [ ] `api.gatethres.app` resolves to the prod backend with valid SSL and a 200 from `/api/health/`.
- [ ] `gatethres.com` resolves (either as primary or as 301 to `.app` per §6 Q4 decision).
- [ ] GitHub repo renamed; CI green on the new repo name.
- [ ] All §2.1 active code/config references to "eventgate" replaced (or explicitly retained with reason).
- [ ] All §2.2 documentation updated (README, brief, runbook §1.4 + §intro).
- [ ] Sentry receiving events from the new prod backend; old `eventgate` project muted or marked staging-only.
- [ ] Resend sending from `mail.gatethres.app`; test QR delivered to an allow-listed address within 30s.
- [ ] Telegram bot responding under `@gatethres_bot` (or whatever username lands); `getWebhookInfo` shows the prod backend URL.
- [ ] Tigris bucket `gatethres-backend-media` exists; CSV import test against prod env succeeds.
- [ ] Runbook §1.5 Plan F + Plan G regression smoke passes against prod env (not staging).
- [ ] Vatana has signed off on Khmer brand-bearing strings, including the Khmer transliteration of "Gatethres."
- [ ] Pronunciation note (GATE-thress) appears at least once in: README, brief §14 row 1, runbook §intro.
- [ ] No staging URLs leak into pilot-facing materials (grep the runbook).
- [ ] Runbook §intro `Brand name` row flipped from ⏳ to ✅.

---

## Appendix A — 9-round candidate audit (for the record)

Roughly 85 candidates checked across 9 rounds (rounds 6 and 8 had a/b/c sub-batches). The complete list of candidates that passed strict availability + brand-conflict checks: **Gatethres** (winner — 10/10 TLDs free, zero collision), Slidegate, Soglia, Iter, Lychgate, Threshly, GateLoop, GateNode.

### Round 1 — abstract Latin/English nouns

Tessera, Limen, Foyer, Linea, Stile, Lintel. **All blocked** — every short Latin/English noun in the threshold/gateway space was claimed in the 90s–2010s. Brand-mindshare conflicts: Tessera Labs (a16z $68M ERP-modernization SaaS), ConsenSys Linea (Ethereum L2), Stile Education (just acquired by Curriculum Associates), usefoyer.com (client-portal SaaS).

### Round 2 — coined + compound

Postern, Threshly, Limna, Tessen, Gateline, Doorpass, Snapgate. Initial favorite Gateline turned out to be hosting an active Twenty CRM instance at `gateline.app` (verified via curl). Threshly survived as round-2 cleanest.

### Round 3 — coined + compound (tighter availability bar)

Pasera, Limnio, Tessio, Doorlet, Letin, Doorly, Crosspass. Two truly-free .app survivors: **Limnio** (collided with Greek wine grape — search-collision risk), **Doorlet** (clean — but user feedback: "too simple").

### Round 4 — obscure English / Latin

Stoop, Sallyport, Lychgate, Janua, Atrium, Aditus, Linegate, Passline. Only **Lychgate** survived brand check (Sallyport blocked by jail-management SaaS + 2,500-employee security firm; Passline blocked by Argentine event ticketing SaaS — direct competitor).

### Round 5 — substantive real words

Foris, Cardo, Soglia, Stoa, Naos, Ostium, Welkom, Pylon. Two truly-free .app survivors: **Soglia** (Italian "threshold," fully clean), **Stoa** (collided with STOA Digital, Stoa Product Group, Wake Forest Stoa startup).

### Round 6 + 6b — single-syllable Greek/Latin or invented

Crux, Limn, Pyx, Strix, Vert, Threx, Klyn, Plyx + Vyx, Klyx, Tryx, Spes, Drey, Slex, Prex, Vrex. **Zero truly-free .app survivors.** Single-syllable domains are structurally exhausted in late 2026.

### Round 7 — two-syllable Greek/Latin or invented

Hodos, Vado, Iter, Velto, Krelo, Klaron, Vexta, Plynth. One truly-free .app survivor: **Iter** (Latin "journey" — but search-mindshare polluted by the ITER fusion megaproject).

### Round 8a–8c — gate-themed (user-directed initial pivot)

8a: Gate, TheGate, Agate, OpenGate, GateFlow, GateWise, GateSet, GateKit. Only `gateset.app` truly free — blocked by Turkish access-control hardware company.

8c: Gately, GateOS, GateWave, GateNet, GateLab, GateLink, GateNode, GateLoop, ClearGate, QuickGate. Three truly-free .apps not blocked: **GateLoop, GateNode, GateLink**. User initially picked GateLink, then did independent extension check and found other TLD conflicts beyond what was originally surveyed.

### Round 9 — user-directed shortlist (final)

User-surfaced: scangate, walkgate, slidegate, glide, passthrough, gatepass, **gatethres**. Five blocked: ScanGate (two ®-registered products at Treventus and Datatronic), WalkGate (active iPhone screen-time-blocker app at walkgate.app), Glide (Glide Apps no-code SaaS), Passthrough (generic — taken everywhere), GatePass (saturated SaaS category — multiple visitor-management products). **Slidegate** survived as backup. **Gatethres — a coined truncation the user surfaced — turned out to be the unicorn: all 10 checked TLDs truly unregistered, zero brand collision in any class. Picked.**

---

## Appendix B — Quick links

- Brief §14 row 1 (Phase-0 brand task): [`docs/brief.md`](../brief.md)
- Pilot launch runbook §1.4 (rename surface): [`docs/plans/2026-05-23-pilot-launch-runbook.md`](./2026-05-23-pilot-launch-runbook.md)
- Staging shakedown findings (where the external blocker was last logged): [`docs/plans/2026-05-23-pilot-runbook-staging-shakedown-findings.md`](./2026-05-23-pilot-runbook-staging-shakedown-findings.md)
- Improvement + findings log: [`docs/plans/improvement-and-findings-logs.md`](./improvement-and-findings-logs.md)
