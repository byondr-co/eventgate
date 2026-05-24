# Plan H — brand rename + prod env split (design)

> **Authored:** 2026-05-24 · **Owner:** Vinei (vinei.ro@squeeze-inc.co.jp) · **Anchors:** brief §14 row 1 (Phase-0 brand-name task); pilot launch runbook §1.4 (rename surface) + §intro (external blockers); first-pilot window 2026-06-05 → 2026-07-03 (12 days from today).
>
> **Brand pick:** **GateLink** — compound: *gate + link*. Direct semantic: the link between guests and gates / between scanner devices and the server. Came out of an 8-round candidate search (~80 names checked). `gatelink.app` is truly unregistered as of 2026-05-24 (DNS lookup empty — registerable at Cloudflare for ~$14/yr). `gatelink.com` is held but passively parked (GoDaddy IP, no live content). Brand collision flagged: **GateLink Ltd Bulgaria** — small EU IT/cybersecurity firm at gatelink.bg; different market (Bulgaria vs SEA), different specific product (cybersecurity vs event check-in). Considered co-existable on TM in IC 9 + IC 42 but worth confirming via formal search (§1.2).
>
> **Scope:** (a) lock in GateLink pending TM checks; (b) inventory every place "eventgate" appears as a brand-bearing string and rename it; (c) provision a new **prod environment** alongside the existing staging env (which keeps running for shakedown); (d) update runbook + brief + README to reflect the new brand. Implementation waves break out via writing-plans after this design is approved.
>
> **Status:** ⏳ Design phase. TM/handle deep-checks outstanding (§1.2). Rename + prod-split execution to follow as a plan-execution doc with per-wave worktrees per the user's standard workflow.

---

## 1. Brand pick — GateLink

### 1.1 Decision rationale

Pulled from an 8-round candidate search covering ~80 names. The full audit matrix is in Appendix A; the headline learnings are:

- **Single-syllable .com / .app is structurally exhausted in late 2026.** Even invented 3-4 letter consonant clusters (Vyx, Klyx, Tryx, Prex, Vrex) all returned LIVE or held-on-marketplace. Round 6 + 6b: 0 truly-free survivors across 16 candidates.
- **Abstract Latin/English nouns (threshold, gateway, door, line, passage) were claimed in the 90s–2010s.** Round 1: 0 candidates clear of both URL conflict and brand-mindshare collision. Tessera blocked by Tessera Labs (a16z, $68M); Linea blocked by ConsenSys L2; Stile by Stile Education; Foyer by usefoyer.com.
- **Coined-word + SaaS-suffix names** (Threshly, Doorlet, Limnio) were available but read as generic-SaaS or folksy. User reaction: rejected on aesthetic grounds.
- **Gate-themed compounds** (rounds 8a–8c) yielded 5 truly-free .apps but most had brand-conflict in the access-control vendor space (Gateline → Twenty CRM hosts at gateline.app; Gateset → GateSet Security Systems, Turkish access-control hardware; GateLab → London Stock Exchange Group / Euronext; GateNet → GSX Group fintech; GateLink → Bulgarian IT/cybersecurity firm).
- **Final viable picks:** GateLink (round 8c) and GateLoop / GateNode (round 8c). User picked GateLink as their preference.

**Why GateLink:**
- Compound (gate + link) → instantly meaningful in English; both halves common roots. Semantic: the *link* between scanner devices and the server; the *link* between guests and gates.
- `gatelink.app` is **truly unregistered** — no DNS records of any kind. Cleanest possible URL acquisition path (register at Cloudflare today for ~$14, no negotiation needed).
- `gatelink.com` is held by a passive owner (GoDaddy NS, parked) — no active brand using it. Acquirable later if desired; not pilot-blocking.
- Brand-mindshare in software search: dominated by larger SaaS-adjacent names (LogicGate, GateHub crypto). GateLink Ltd Bulgaria is the closest direct collision but small-EU IT/cybersecurity — narrowly scoped TM filing likely, different geographic market.
- Pronounceable in English + Khmer (both syllables CVC, no awkward clusters). 8 chars / 2 syllables.

**Trade-offs / known risks:**
- "Link" suffix is a tired tech trope (Microsoft LinkedIn, Linktree, LinkedIn-derived names) — less distinctive than a coined word.
- GateLink Bulgaria is in B2B SaaS (cybersecurity / data protection). TM coexistence on IC 9 + IC 42 needs explicit verification before any rename ships.
- gatelink.io is owned by a French OVH-hosted entity — not pilot-blocking but means we don't get .io in the same swing.

### 1.2 Verification — outstanding before lock-in (BLOCKER)

User-driven, ~15–20 min total. None of the rename mechanics in §2–§5 should begin until these clear.

- [ ] **USPTO TESS** — [tmsearch.uspto.gov](https://tmsearch.uspto.gov) — search "GateLink" + "Gatelink" + "Gate Link" in IC 9 (downloadable software) + IC 42 (SaaS / hosted services). Specifically filter for the Bulgarian filing if any reaches USPTO.
- [ ] **EUIPO eSearch** — [tmdn.org/tmview](https://www.tmdn.org/tmview/welcome) — same query, same classes. GateLink Bulgaria likely has at least a Bulgarian filing; verify whether it extends to EUTM.
- [ ] **IPOS Singapore** — [ipos.gov.sg](https://www.ipos.gov.sg) — same query (hosting region is Singapore → matters for nominative use). Khmer / Cambodian IP office is harder to access online; defer unless TM lawyer involved.
- [ ] **GitHub org `gatelink`** — check at [github.com/gatelink](https://github.com/gatelink). If taken, fall back to `gatelink-app`, `gatelinkhq`, or `gate-link`.
- [ ] **X/Twitter `@gatelink`** — handle availability.
- [ ] **npm `gatelink`** scope — check at [npmjs.com/~gatelink](https://www.npmjs.com/~gatelink) and [npmjs.com/package/gatelink](https://www.npmjs.com/package/gatelink).
- [ ] **Register `gatelink.app`** immediately when the above clears (Cloudflare Registrar preferred — wholesale pricing, no upsell, includes Cloudflare DNS by default; ~$14/yr).
- [ ] **Optional:** outreach to `gatelink.com` current registrant for acquisition price (low priority — passive ownership; can sit indefinitely).

### 1.3 Fallback

If TM check surfaces a blocking conflict on GateLink (e.g., Bulgarian filing extends to EUTM or USPTO and is broad enough to cover our use):

1. Fall back to **Soglia** (round 5 survivor — Italian for "threshold," `soglia.app` truly free, zero brand collision in any class). 3 syllables (SOH-lee-ah) is longer than ideal but substantively meaningful. Same Plan H mechanics apply with `s/gatelink/soglia/g` throughout this doc.
2. Secondary fallback: **GateLoop** or **GateNode** (round 8c survivors — also truly-free .app, no brand collision). Both are 2-syll compound and were close runner-ups to GateLink in the user's preference.
3. If multiple fallbacks fail, run round 9 with a totally different concept (action, technology, place, mood — not gate / threshold).

---

## 2. Rename surface inventory

Repo state at 2026-05-24: **909 occurrences across 46 files**. ~875 of those are in `docs/plans/2026-05-19-plan-a-*` through `docs/plans/2026-05-23-plan-g-*` and the verification checklists / findings — i.e., **historical plan documents that describe what was built under the working name**. **These stay as-is** — they're the audit trail of how we got here, and rewriting them rewrites history. Plan H is the first doc that uses "GateLink."

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
| `docs/brief.md` | 5 | Working-name references throughout. Brief §14 row 1 (the Phase-0 brand task) gets marked **resolved → GateLink**. |
| `docs/handoff-2026-05-20.md` | 13 | Historical handoff doc — borderline. Leave as-is per "history stays" rule, or add a one-line preamble noting the rename happened on YYYY-MM-DD. |
| `docs/plans/2026-05-23-pilot-launch-runbook.md` | 15 | **Must update.** Runbook §1.4 placeholders (`<brand>-backend.fly.dev`, `<brand>.app`, `@<brand>_bot`, `<brand>-backend-media`) get filled in with `gatelink`. §intro brand-name blocker row goes from ⏳ to ✅. |
| `docs/plans/2026-05-23-pilot-runbook-staging-shakedown-findings.md` | (count above) | Historical findings — leave as-is. |

### 2.3 External-system surfaces (per runbook §1.4 + brief context)

| Surface | Current | New (GateLink) | Cutover difficulty |
|---|---|---|---|
| GitHub repo name | `eventgate` | `gatelink` | ⚠️ External. GitHub keeps redirects, but everyone with a local clone needs `git remote set-url`. Includes any pre-pilot collaborators. |
| Backend Fly app | `eventgate-backend-staging` (staging only) | `gatelink-backend` (new prod app — see §3) | High — net-new app + DNS + SSL + secrets re-create. |
| Frontend Vercel project | `frontend-five-lovat-94` (staging) | `gatelink-app` (new prod project — see §3) | Medium — net-new project + DNS + env vars. |
| Sentry project slug | `eventgate` | `gatelink` | Low — either rename existing slug or create new prod project (preference: new project, see §3). |
| Resend domain | current sender on staging | `mail.gatelink.app` | Medium — DNS records (DKIM, SPF, return-path), domain reverification cycle. |
| Telegram bot username | `@eventgate_bot` | `@gatelink_bot` | Low — BotFather supports username rename (token stays). Webhook URL must be re-pointed via `setup_telegram_webhook` against the prod backend (per runbook §1.3). |
| Tigris bucket | `eventgate-backend-staging-media` | `gatelink-backend-media` | Medium — new bucket; no data to migrate if prod env starts fresh. |
| Domain (apex) | none | `gatelink.app` → Vercel; `api.gatelink.app` → Fly | Medium — DNS provisioning + SSL cert issuance. |

### 2.4 Khmer strings touching the brand

Khmer translator (Vatana) is already on the queue for `frontend/lib/i18n/messages/km.json` per runbook §intro. Brand-bearing strings (login screen, email templates, PWA install banner, Telegram bot replies) need re-translation in sync with the brand cutover. Add to the Vatana-review packet.

---

## 3. Prod environment split

Today only **staging** infrastructure exists. The pilot needs a separate prod env so test data, broken deploys, and operator experiments don't bleed into the customer-facing flow.

### 3.1 What gets a prod twin

| Resource | Staging (keep) | Prod (new) | Provisioning notes |
|---|---|---|---|
| Fly backend app | `eventgate-backend-staging` | `gatelink-backend` | Singapore region (`sin`), same `fly.toml` template, same secrets but with prod values. Use `fly launch --copy-config` from staging. |
| Vercel frontend | `frontend-five-lovat-94` | `gatelink-app` (or `gatelink`) | Production branch = `main`. Connect to same GitHub repo (renamed). Set `NEXT_PUBLIC_*` env vars to point at `api.gatelink.app`. |
| Postgres | Neon staging branch | Neon prod branch | Fresh empty DB — no migration of staging test data. Apply all migrations via `release_command` on first deploy. Run audit trigger seed (per runbook §1.3). |
| Redis | Upstash staging | Upstash prod | Same Singapore region. Connection URL into Fly secrets. |
| Sentry | personal-org / `eventgate` (verified 2026-05-23) | personal-org / `gatelink` (new project) | New project. Prod env tag = `prod`. Pre-emptively mute audit-trigger-blocked-write test exceptions. Separate DSN. |
| Resend | staging sender | sender from `mail.gatelink.app` | New domain in Resend dashboard; add DNS to `gatelink.app`. Send a test QR to a deliverable address before pilot. |
| Tigris (media bucket) | `eventgate-backend-staging-media` | `gatelink-backend-media` | New bucket. Bucket creds into Fly secrets. CSV imports start fresh. |
| Telegram bot | `@eventgate_bot` (verified 2026-05-23) | `@gatelink_bot` | Two options: (a) rename existing bot via BotFather (token preserved, username changes) and point webhook at prod backend; (b) create a new bot for prod. **Recommend (a)** — preserves the bot identity and any allow-listed test chats. |
| Domain DNS | n/a | `gatelink.app` → Vercel; `api.gatelink.app` → Fly | Cloudflare or Vercel-managed DNS. Open question — see §6. |
| GitHub Actions deploy | targets `eventgate-backend-staging` | targets `gatelink-backend` | `.github/workflows/deploy-backend.yml` `--app` flag changes. |

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

1. **Wave 0 — User-side TM + handle checks (BLOCKER).** Nothing else starts until §1.2 clears.
2. **Wave 1 — Domain + handle land-grab.** Register `gatelink.app` (Cloudflare Registrar). Reserve GitHub org `gatelink` (or fallback `gatelink-app` / `gatelink-hq`), X handle `@gatelink`, npm namespace `gatelink`.
3. **Wave 2 — Prod infrastructure provisioning.** New Fly app, new Vercel project, new Neon branch, new Upstash, new Sentry project, new Resend domain, new Tigris bucket. None of this touches the existing staging env.
4. **Wave 3 — DNS + SSL.** Point `gatelink.app` and `api.gatelink.app` at the new resources. Wait for SSL issuance and cache propagation.
5. **Wave 4 — Telegram bot rename + webhook re-point.** BotFather rename + `setup_telegram_webhook` against the new prod backend URL.
6. **Wave 5 — Repo internal rename.** Find + replace `eventgate` → `gatelink` in active code/config (see §2.1). Bump service worker cache key + Dexie keeps its name (§2.1 note). Run full backend pytest + frontend vitest + tsc + lint locally. Open as a PR to main.
7. **Wave 6 — Documentation rename.** README, brief §14 row 1, runbook §1.4 + §intro. (Historical plans + handoffs left untouched.)
8. **Wave 7 — GitHub repo rename.** `eventgate` → `gatelink` on the GitHub side. Local `git remote set-url` + any collaborator notification. Update GitHub Actions `--app` flag to the new prod app.
9. **Wave 8 — Khmer brand-bearing strings.** Vatana re-translation packet covers the new brand strings (login, email subject lines, PWA install, Telegram replies).
10. **Wave 9 — Prod env smoke.** Run runbook §1.5 Plan F + Plan G regression smoke against the prod env (not staging). Spin up a throwaway `gatelink-acceptance` org + event for the smoke; archive/delete after.
11. **Wave 10 — Runbook + Plan H closeout.** Mark `Brand name` row in runbook §intro from ⏳ to ✅. Capture any leaked staging URLs / leftover strings in §6.6 of the runbook.
12. **Pilot launch.** First-pilot event runs on prod (`gatelink.app`, `api.gatelink.app`).

### 4.2 Critical-path risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TM filing surfaces a conflict on GateLink post-rename (Bulgarian or other) | Low–med | High (rollback to Soglia or GateLoop/GateNode) | Run §1.2 verification BEFORE any rename ships. Reserve fallback handles cheaply now. |
| DNS / SSL provisioning takes > 1 day | Med | High (slips Wave 9 smoke; pushes against pilot date) | Provision DNS on Wave 1 alongside domain registration, not Wave 3. Cloudflare-issued SSL is fast (~5 min). |
| Telegram bot rename loses webhook silently | Med | Medium (Telegram path goes dark; not P1 if email-QR fallback works) | Per runbook §1.3 lesson: always re-run `setup_telegram_webhook` and verify with `getWebhookInfo` showing the new URL + `pending_update_count < 10`. |
| Cookie rename logs everyone out mid-pilot prep | High (by design — see §2.1) | Low if scheduled, High if accidental | Ship cookie rename in Wave 5 (well before pilot day). Communicate in advance to anyone testing. Or: dual-read for 24h post-cutover. |
| Service worker cache key bump fails to invalidate on operator devices | Med | High (operators stuck on stale PWA mid-pilot) | Cache-key bump forces refetch; verify on Vatana's actual device during T-1 day smoke (runbook §1.5). |
| Repo rename breaks anyone with local clones | High | Low (GitHub keeps redirects; affected users `git remote set-url`) | Single-line note in handoff doc + Telegram DM to any active collaborators. |
| 909-occurrence find/replace hits historical plans we wanted to leave alone | Med | Medium (rewrites history) | Use targeted file lists in §2.1 + §2.2 — do not run a repo-wide `sed`. Each wave's PR diff gets eyeballed before merge. |
| Pilot date 2026-06-05 — only 12 days from today (2026-05-24) — runbook risk line says anything not shipped by 2026-05-29 is risk-bearing | Real | High (delayed pilot) | Sequence aggressively. Waves 0–2 can run in 1 day if TM clears fast. Waves 3–7 in 2–3 days. Waves 8–10 in the remaining 3–4 days. Slack: ~3 days if things go right. |

### 4.3 Reversibility

| Action | Reversible? | Notes |
|---|---|---|
| Register `gatelink.app` | Effectively no (sunk ~$14) | Cheap. |
| Provision new Fly app | Yes | `flyctl apps destroy gatelink-backend` reverses. |
| Provision new Vercel project | Yes | Delete from dashboard. |
| Provision new Neon branch | Yes | Delete branch. |
| New Sentry project | Yes | Delete project. |
| New Resend domain | Yes | Remove from dashboard; DNS records can stay. |
| New Tigris bucket | Yes | Empty + delete. |
| BotFather rename `@eventgate_bot` → `@gatelink_bot` | Yes (within Telegram limits — they allow renames; tokens persist) | Old username may be reclaimable. |
| Repo rename `eventgate` → `gatelink` on GitHub | Yes | GitHub keeps redirects on both old and new. |
| String find/replace in code | Yes via `git revert` | Each wave is its own PR. |
| Runbook + brief rewrites | Yes via `git revert` | Documentation is repo-managed. |
| Khmer re-translation | Yes (revert km.json) | But pays a translator-time cost. |

---

## 5. Out of scope

- **Custom domain for the dashboard beyond `gatelink.app`.** Deferred — `gatelink.app` is sufficient for the pilot.
- **Acquiring `gatelink.com` or `gatelink.io`.** Deferred — current owners are passive; not pilot-blocking. Revisit post-pilot if brand-traffic confusion materializes.
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
3. **Acquire `gatelink.com` (or `.io`) now or later?** Recommend later — not pilot-blocking, and current owners' passive use suggests low pressure.
4. **Rename `eventgate-backend-staging` Fly app post-cutover, or leave it?** Recommend leave it — staging name doesn't need to match brand; renaming risks downtime on a working env.
5. **Telegram bot: rename existing `@eventgate_bot` or create new `@gatelink_bot`?** Recommend rename — preserves bot token and any allow-listed test chats.
6. **Cookie rename cutover style — atomic with logout, or dual-read for 24h?** Recommend atomic with logout — simpler; all logged-in users get redirected to login on next request. Pilot operators re-enroll devices fresh anyway.
7. **Wave granularity for execution plan — one PR per wave, or batched waves?** Per user's per-task worktree workflow, recommend one PR per wave (parallelizable where independent).

---

## 7. Acceptance criteria

Plan H is done when **all of the following** hold:

- [ ] §1.2 TM/handle deep-checks all green (or fallback to Soglia / GateLoop / GateNode executed).
- [ ] `gatelink.app` resolves to the prod dashboard with valid SSL.
- [ ] `api.gatelink.app` resolves to the prod backend with valid SSL and a 200 from `/api/health/`.
- [ ] GitHub repo renamed; CI green on the new repo name.
- [ ] All §2.1 active code/config references to "eventgate" replaced (or explicitly retained with reason).
- [ ] All §2.2 documentation updated (README, brief, runbook §1.4 + §intro).
- [ ] Sentry receiving events from the new prod backend; old `eventgate` project muted or marked staging-only.
- [ ] Resend sending from `mail.gatelink.app`; test QR delivered to an allow-listed address within 30s.
- [ ] Telegram bot responding under `@gatelink_bot` (or whatever username lands); `getWebhookInfo` shows the prod backend URL.
- [ ] Tigris bucket `gatelink-backend-media` exists; CSV import test against prod env succeeds.
- [ ] Runbook §1.5 Plan F + Plan G regression smoke passes against prod env (not staging).
- [ ] Vatana has signed off on Khmer brand-bearing strings.
- [ ] No staging URLs leak into pilot-facing materials (grep the runbook).
- [ ] Runbook §intro `Brand name` row flipped from ⏳ to ✅.

---

## Appendix A — 8-round candidate audit (for the record)

Roughly 80 candidates checked across 8 rounds (rounds 6 and 8 had a/b/c sub-batches). Survivors that passed strict availability + brand-conflict checks: GateLink, GateLoop, GateNode, Soglia, Iter, Lychgate, Threshly.

### Round 1 — abstract Latin/English nouns

Tessera, Limen, Foyer, Linea, Stile, Lintel. **All blocked** — every short Latin/English noun in the threshold/gateway space was claimed in the 90s–2010s. Brand-mindshare conflicts: Tessera Labs (a16z $68M ERP-modernization SaaS), ConsenSys Linea (Ethereum L2), Stile Education (just acquired by Curriculum Associates), usefoyer.com (client-portal SaaS).

### Round 2 — coined + compound

Postern, Threshly, Limna, Tessen, Gateline, Doorpass, Snapgate. Three survivors (Postern, Threshly, Gateline) initially passed brand check; Postern later compromised by an active London M&A firm (Postern Equity Partners); Gateline later compromised by `gateline.app` actively hosting a Twenty CRM instance (verified via curl). Threshly survived.

### Round 3 — coined + compound (tighter availability bar)

Pasera, Limnio, Tessio, Doorlet, Letin, Doorly, Crosspass. Two truly-free .app survivors: **Limnio** (collided with Greek wine grape — search-collision risk), **Doorlet** (clean — but user feedback: "too simple").

### Round 4 — obscure English / Latin

Stoop, Sallyport, Lychgate, Janua, Atrium, Aditus, Linegate, Passline. Four truly-free .app candidates; only **Lychgate** survived brand check (Sallyport blocked by jail-management SaaS + 2,500-employee security firm; Linegate blocked by Cairo IoT firm; Passline blocked by Argentine event ticketing SaaS — direct competitor).

### Round 5 — substantive real words

Foris, Cardo, Soglia, Stoa, Naos, Ostium, Welkom, Pylon. Two truly-free .app survivors: **Soglia** (Italian "threshold," fully clean), **Stoa** (collided with STOA Digital, Stoa Product Group, Wake Forest Stoa startup).

### Round 6 + 6b — single-syllable Greek/Latin or invented

Crux, Limn, Pyx, Strix, Vert, Threx, Klyn, Plyx + Vyx, Klyx, Tryx, Spes, Drey, Slex, Prex, Vrex. **Zero truly-free .app survivors.** Single-syllable domains are structurally exhausted in late 2026; even invented 3-4 letter consonant clusters are held by domain investors.

### Round 7 — two-syllable Greek/Latin or invented

Hodos, Vado, Iter, Velto, Krelo, Klaron, Vexta, Plynth. One truly-free .app survivor: **Iter** (Latin "journey" — but search-mindshare polluted by the ITER fusion megaproject).

### Round 8a–8c — gate-themed (user-directed)

8a: Gate, TheGate, Agate, OpenGate, GateFlow, GateWise, GateSet, GateKit. Only `gateset.app` truly free — blocked by Turkish access-control hardware company.

8b — skipped to 8c.

8c: Gately, GateOS, GateWave, GateNet, GateLab, GateLink, GateNode, GateLoop, ClearGate, QuickGate. Five truly-free .apps; three blocked by SaaS namesakes (GateLab → LSE Group, GateNet → GSX Group, GateLink → Bulgarian IT/cybersecurity). **GateLoop, GateNode, GateLink** survived as cleanest. User preferred GateLink + QuickGate; QuickGate ruled out (active EU digital-identity SaaS namesake at quick-gate.info, plus `quickgate.com` "coming soon" likely same outfit). **GateLink picked.**

---

## Appendix B — Quick links

- Brief §14 row 1 (Phase-0 brand task): [`docs/brief.md`](../brief.md)
- Pilot launch runbook §1.4 (rename surface): [`docs/plans/2026-05-23-pilot-launch-runbook.md`](./2026-05-23-pilot-launch-runbook.md)
- Staging shakedown findings (where the external blocker was last logged): [`docs/plans/2026-05-23-pilot-runbook-staging-shakedown-findings.md`](./2026-05-23-pilot-runbook-staging-shakedown-findings.md)
- Improvement + findings log: [`docs/plans/improvement-and-findings-logs.md`](./improvement-and-findings-logs.md)
