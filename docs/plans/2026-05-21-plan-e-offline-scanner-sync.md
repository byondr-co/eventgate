# Plan E — Offline Scanner Sync (Workbox + IndexedDB + Mutation Queue + Conflict Routing)

> **For agentic workers:** TDD discipline applies to every backend task (red → green → commit). Each task has `- [ ]` checkboxes for tracking. Backend tasks are sized for the Agent tool (general-purpose, sonnet) with the full task body inlined; frontend + deploy tasks are inline-controller work.

**Goal:** The pre-registered scanner PWA keeps working with no network. Offline scans validate against an IndexedDB guest cache, queue a `pending` mutation, and replay on reconnect. Server-authoritative conflict resolution (a 409 from a *different* device while we were offline) marks the mutation as `conflict` and routes a signal to a future help-desk lane (Plan F) — Plan E ships the signal pipe, Plan F builds the inbox.

This is **Plan E of an 8-plan Phase 1 sequence** (see `docs/brief.md` §12 W9–10). Help-desk lane + audit-viewer UI + dashboard polling is Plan F. Telegram + CSV import is Plan G. Pilot QA hardening is Plan H.

**Architecture:**

- **Service worker** — Replace Plan D's minimal `public/sw.js` (static-only) with a Workbox-composed SW built from `workbox-precaching`, `workbox-strategies`, and `workbox-routing` modules. Bundled via a small esbuild script (`frontend/scripts/build-sw.mjs`). No `next-pwa` / `@serwist/next` runtime — keeps the build graph thin and the SW behavior explicit.
- **`apps.guests` sync endpoint** — `GET /api/v1/orgs/<org>/events/<event>/guests/sync/?since=<iso>` returns the minimal guest projection the scanner needs (`id`, `entry_token`, `full_name`, `email`, `guest_type`, `entry_status`, `info_status`, `updated_at`). Anonymous-from-the-scanner — gated by `SessionTokenAuthentication`. Returns an `ETag` (hash of the max `updated_at` returned). When `If-None-Match` matches, returns `304 Not Modified`. Used for both initial bulk snapshot and incremental refresh.
- **Dexie schema** — `frontend/lib/scanner/db.ts` defines three IndexedDB stores via Dexie 4: `guests` (mirror of the sync projection, keyed by `entry_token`), `mutation_queue` (offline check-in writes, keyed by client-side uuid), and `meta` (single-row table for the `sync_cursor` + `etag` + `last_full_sync_at`).
- **Mutation queue** — Status enum `pending → in_flight → completed | conflict | failed | escalated`. Each row carries `client_idempotency_key` (uuid generated at scan time — same key reused on every retry so the server idempotency layer in Redis short-circuits replays). Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s; after 8 failed attempts, status flips to `failed`.
- **Server-authoritative conflict resolution** — When a queued mutation flushes and the server returns `409 duplicate`, the client inspects `guest.gate` / `guest.scanner` from the response payload. If they match the local device's gate + scanner_label, it's a self-replay (idempotency-cache miss + our own previous flush) → mark `completed`. If they differ, a *different* scanner won the race → mark `conflict` and surface a "Send to help desk" affordance. Server-side, `apps.checkins.services.perform_checkin` writes an additional `checkin.conflict` audit row when the duplicate originator and current scanner disagree on `(gate, scanner_label)`. This row is what Plan F's help-desk inbox will read.
- **Help-desk handoff (Plan E scope)** — New endpoint `POST /api/v1/scanner/escalations/` accepts `{token, reason, original_payload, conflict_payload}`, validates a scanner session, and writes a single `audit.action = "checkin.help_desk_escalation"` row. Plan F builds the inbox UI that reads these rows; Plan E just emits the signal. Frontend surface: a yellow "⚠ N conflict(s)" pill in the scanner header that opens `/scanner/escalations`, listing conflict rows from the local mutation queue with a "Send to help desk" button per row.
- **PWA install prompt** — Capture `beforeinstallprompt` in the scanner layout, store it on a singleton in `lib/scanner/install.ts`, render an "Install" button in the header next to the online/offline indicator. On `appinstalled`, drop a Sentry breadcrumb and hide the button.
- **Persistent offline banner** — Layout header gains: `● online | ● offline — N queued | ⚠ N conflict(s)`. Below-header banner appears only when offline.
- **Sentry instrumentation** — Browser SDK init for the scanner shell (was deferred in Plan D — the scanner pages currently have no client-side Sentry). `captureException()` for: (a) mutation queue row hitting `failed` status, (b) Dexie schema migration errors, (c) sync endpoint network errors that exhaust retries.

**Tech Stack:**

- **Frontend (new deps):** `dexie@^4.0`, `workbox-precaching@^7.3`, `workbox-strategies@^7.3`, `workbox-routing@^7.3`, `workbox-core@^7.3`, `@sentry/nextjs@^8.x` (frontend Sentry was not configured in Plans A–D; this is its first land), `esbuild@^0.24` (dev-only, for the SW build script).
- **Backend (no new deps):** Two new endpoints (`guests/sync` and `scanner/escalations`) reuse existing serializers + `SessionTokenAuthentication` + `write_audit`. One change inside `perform_checkin` to emit the additional `checkin.conflict` audit row.
- **Deploy:** No new infrastructure. Frontend deploy via Vercel as today. Backend deploy via Fly as today.

**Builds on:** Plans A/B/C/D. Repo at `github.com/vineidev/eventgate`. Backend on Fly Singapore (`eventgate-backend-staging`). Frontend on Vercel (`frontend-five-lovat-94`).

---

## Resolved design decisions (confirmed in brainstorm 2026-05-21)

Three pieces of this plan had explicit open questions during planning. Each was brainstormed with the planner before execution; the chosen path is recorded here so future readers see the reasoning, not just the result.

### Q1. Cache-refresh strategy — incremental `since=` cursor vs full-snapshot TTL

**Decision: Incremental sync.** The `/guests/sync/` endpoint accepts `?since=<iso8601>` and returns only rows where `updated_at >= since`. Client stores the max `updated_at` it has seen in the Dexie `meta` table as `sync_cursor`, and the response ETag as `etag`. Refreshes fire on: (a) `online` event, (b) `visibilitychange` to visible, (c) a 5-minute interval while the scan page is open.

**Why not full-snapshot TTL (6h):** simpler client code, but at ≤10k guests × ~200B projection that's ~2MB re-pulled every 6h per device. Incremental is cheaper per refresh (typical delta <50 rows) and Guest already has a reliable `updated_at`.

**Why not per-row ETag:** most HTTP-correct but heaviest impl on both sides; overkill at this scale.

### Q2. Mutation-queue persistence schema

**Recommended schema** (Dexie `mutation_queue` store):

```ts
type QueuedMutation = {
  id: string;                       // client uuid, primary key
  mutation_type: "checkin";         // (extension point for future: "walkin_info", etc.)
  target_token: string;             // denormalized so we can look up against the guest cache without parsing payload
  client_idempotency_key: string;   // sent verbatim to server on every retry — Redis idempotency cache de-dupes
  payload: {                        // exact body POSTed to /api/v1/checkins/
    token: string;
    gate: string;
    scanner_label: string;
    client_idempotency_key: string;
  };
  status: "pending" | "in_flight" | "completed" | "conflict" | "failed" | "escalated";
  attempts: number;
  next_attempt_at: number;          // epoch ms; in_flight rows ignore this
  created_at: number;               // epoch ms — when the staffer scanned
  completed_at: number | null;      // epoch ms when status moved to completed/conflict/failed
  last_error: string | null;        // human-readable failure summary
  server_response: unknown | null;  // raw server JSON for conflict/failed rows
};
```

**Indexes:** primary `id`; secondary `status`, `[status+next_attempt_at]`, `target_token`.

**Retention:** completed rows are purged 24h after `completed_at`. Conflict + failed rows are kept until the staffer escalates (status moves to `escalated`) or manually clears them; escalated rows are purged after 24h.

**Decision: denormalized.** `target_token` duplicates `payload.token`; `client_idempotency_key` lifted to its own column for indexing. Costs ~30B/row but lets the UI query without JSON-parsing payload on every render. Confirmed in brainstorm 2026-05-21.

### Q3. "Send to help desk" handoff before Plan F exists

**Decision: single `AuditEvent` row per escalation.** Plan E ships `POST /api/v1/scanner/escalations/` that writes one audit row with `action = "checkin.help_desk_escalation"`. Plan F's help-desk lane reads these rows (filtered by `action` + `event`) and renders a queue UI. Plan E's frontend surface is a list page at `/scanner/escalations` showing the local mutation queue's `conflict` rows, with a "Send to help desk" button that:

1. POSTs `{token, reason: "scanner_offline_conflict", original_payload, conflict_payload}` to `/api/v1/scanner/escalations/`.
2. On success, marks the local row as `escalated` (status enum value).
3. Decrements the conflict counter in the header.

The audit row is the single source of truth. The signal is durable even if the scanner device is later revoked.

**Why not a dedicated `HelpDeskTicket` table:** more correct long-term but doubles Plan E's backend surface (new model, migration, serializer, view set), and Plan F still has to build the UI. Plan F may introduce the table at the same time it builds the inbox, with a one-shot data migration from existing audit rows.

**Why not client-only `escalated` status:** signal dies if the device is revoked or cache is cleared. The audit row gives durability for the cost of one POST.

Confirmed in brainstorm 2026-05-21.

---

## File Structure

```text
backend/
├── apps/
│   ├── guests/
│   │   ├── serializers.py                 ← MODIFY: add GuestSyncSerializer (minimal projection)
│   │   ├── views.py                       ← MODIFY: add GuestSyncView
│   │   └── urls.py                        ← MODIFY: wire /guests/sync/
│   ├── checkins/
│   │   └── services.py                    ← MODIFY: emit checkin.conflict audit row on cross-device 409
│   └── scanner/                           ← NEW APP (small — one endpoint)
│       ├── __init__.py / apps.py
│       ├── views.py                       ← EscalationView
│       ├── urls.py
│       └── migrations/                    ← empty; no models
├── config/
│   ├── settings/base.py                   ← MODIFY: add "apps.scanner" to INSTALLED_APPS
│   └── urls.py                            ← MODIFY: include scanner urls
├── fly.toml                               ← MODIFY (Task 0a): worker.restart=always
└── tests/
    ├── test_guests_sync_endpoint.py
    ├── test_checkin_conflict_audit.py
    ├── test_scanner_escalation_endpoint.py
    └── test_mypy_ignores.py               ← REMOVED — see Task 0d

frontend/
├── app/
│   ├── scanner/
│   │   ├── layout.tsx                     ← MODIFY: install prompt + queued/conflict counters + offline banner
│   │   ├── scan/page.tsx                  ← MODIFY: route to offline path when navigator.onLine === false
│   │   └── escalations/page.tsx           ← NEW
│   └── sw.ts                              ← NEW source for the Workbox SW (compiled via build-sw.mjs)
├── components/
│   └── scanner/
│       ├── install-button.tsx             ← NEW
│       ├── conflict-row.tsx               ← NEW
│       └── offline-banner.tsx             ← NEW
├── lib/
│   └── scanner/
│       ├── db.ts                          ← NEW Dexie schema + helpers
│       ├── guest-cache.ts                 ← NEW initial-sync + incremental-refresh logic
│       ├── mutation-queue.ts              ← NEW enqueue/getPending/flush/markCompleted/markConflict/markFailed/markEscalated
│       ├── sync.ts                        ← NEW main reconnect loop (online event + interval)
│       ├── install.ts                     ← NEW beforeinstallprompt capture
│       └── sentry.ts                      ← NEW browser Sentry init for the scanner shell
├── scripts/
│   └── build-sw.mjs                       ← NEW esbuild step: bundle app/sw.ts → public/sw.js with Workbox runtime
├── public/
│   └── sw.js                              ← REPLACED: now the esbuild output
├── package.json                           ← MODIFY: pin prettier exactly, add dexie + workbox + sentry/nextjs + esbuild
├── next.config.ts                         ← MODIFY: prebuild hook to run scripts/build-sw.mjs
└── sentry.client.config.ts                ← NEW Sentry browser config (only loaded under /scanner/* via dynamic import in lib/scanner/sentry.ts)

docs/
├── plans/2026-05-21-plan-e-offline-scanner-sync.md  ← THIS FILE
└── handoff-2026-05-20.md                  ← MODIFY at the end: append a "Plan E complete" entry
```

**Boundary notes:**

- `apps.scanner` exists *only* for the scanner-facing escalation endpoint. It is **not** the scanner PWA — that's still `frontend/app/scanner/`. The naming is intentional: it signals "endpoints intended for the scanner role, not the dashboard user." If the surface grows, it absorbs other scanner-only endpoints (e.g. cache pre-warm, conflict bulk-ack). For now: one view, one URL, one test file.
- `apps.guests.views.GuestSyncView` is **separate** from the existing organizer `GuestListView` (which is JWT-gated and returns the full guest serializer). The sync view is scanner-session-gated, returns the minimal projection, and supports `?since=`.
- `lib/scanner/db.ts` is the **only** module that constructs the Dexie instance. All other scanner modules import the `db` singleton from there. No module reads/writes IndexedDB directly.
- `lib/scanner/mutation-queue.ts` is the **only** writer to the `mutation_queue` store. UI components read via observables exposed from this module; they never query Dexie directly.
- `app/sw.ts` is the SW *source*. It is compiled to `public/sw.js` by `scripts/build-sw.mjs`. Editing `public/sw.js` directly is forbidden — the build script overwrites it. CI runs `pnpm exec node scripts/build-sw.mjs` before `next build` (wired via `next.config.ts`).
- Frontend Sentry is initialized **only** in the scanner shell layout (`app/scanner/layout.tsx`) via a dynamic import. The dashboard `(app)/` and public `(public)/` routes do not load Sentry — Plan E doesn't broaden Sentry's blast radius beyond the scanner.

---

## Task 0 — Operational cleanups from Plan D parking lot

These four follow-ups land first so they don't bleed into the offline work. Each is a small, isolated change. Commit each separately.

### Task 0a: Set `worker.restart=always` in `fly.toml`

**Files:**
- Modify: `backend/fly.toml`

**Background:** Plan D's first worker deploy placed the worker Machine as a standby (started only on demand by the app process). Fix was a `flyctl machine update` call against the deployed Machine, but the `fly.toml` still lacks the explicit declaration — next deploy could regress.

- [ ] **Step 1: Read current `[processes]` block**

```bash
grep -n -A 4 "\[processes\]" /Users/vinei/Projects/eventgate/backend/fly.toml
```

Expected: a `[processes]` block declaring `app = "..."` and `worker = "..."` commands.

- [ ] **Step 2: Add `[processes.worker]` sub-block**

If `fly.toml` has top-level `[processes]` only (no sub-block per process), add the following at the end of the file:

```toml
[processes.worker]
  restart = "always"
```

If `[processes]` is structured as multiple `[[processes]]` array entries, locate the worker entry and add `restart = "always"` inside it.

- [ ] **Step 3: Deploy + verify**

```bash
cd /Users/vinei/Projects/eventgate/backend && flyctl deploy --remote-only
```

Then:

```bash
flyctl machine list --app eventgate-backend-staging | grep worker
```

Expected: worker Machine state shows `started`, not `standby`. `Restart` policy column: `always`.

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add backend/fly.toml && git commit -m "ops(fly): worker.restart=always so worker Machine doesn't deploy as standby"
```

---

### Task 0b: Investigate Vercel auto-deploy from GitHub

**Files:** none committed; produce a finding inside the plan's completion log.

**Background:** Every frontend push currently requires `pnpm dlx vercel@latest --prod --yes` because Vercel isn't auto-deploying from GitHub. Likely causes: GitHub→Vercel app uninstalled, branch mismatch (`main` vs `claude/*`), or webhook config drift.

- [ ] **Step 1: Check Vercel project's git integration**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dlx vercel@latest git ls --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects
```

Expected: shows the connected GitHub repo + production branch. If empty/missing, the integration is unlinked.

- [ ] **Step 2: Check GitHub side**

```bash
gh api repos/vineidev/eventgate/hooks --jq '.[] | {id, name, url: .config.url, active}'
```

Expected: at least one hook pointing to `vercel.com`. If absent, the webhook is missing.

- [ ] **Step 3: Reconnect**

If integration is unlinked: `pnpm dlx vercel@latest link --yes --project frontend-five-lovat-94`. Then in the Vercel dashboard, navigate to Settings → Git → Connect Git Repository. If hook is missing, re-add via GitHub Settings → Apps → Vercel.

- [ ] **Step 4: Verify auto-deploy**

```bash
cd /Users/vinei/Projects/eventgate && git commit --allow-empty -m "test: trigger Vercel auto-deploy" && git push
# Wait ~30s
pnpm dlx vercel@latest list --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects | head -3
```

Expected: a deployment dated within the last minute, with source `git`.

- [ ] **Step 5: Document the root cause + fix**

Add a one-paragraph entry to the plan's completion log under "Deviations / findings" — what was broken, what fixed it. No commit yet; that lands with Task 18.

---

### Task 0c: Pin prettier exactly in `frontend/package.json`

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml` (regenerated)

**Background:** `prettier` is currently `"^3.8.3"` — caret allows minor updates, which drift between local and CI. Plan D had `format` / `format:check` mismatches because of this.

- [ ] **Step 1: Lock the running version**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm list prettier --depth 0
```

Expected: a line like `prettier 3.8.3` (or whatever's installed). Capture this exact version.

- [ ] **Step 2: Edit `package.json`**

Open `/Users/vinei/Projects/eventgate/frontend/package.json` and change:

```json
"prettier": "^3.8.3",
```

to (replace `3.8.3` with the version from Step 1 if different):

```json
"prettier": "3.8.3",
```

- [ ] **Step 3: Regenerate lockfile**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm install --frozen-lockfile=false
```

Expected: lockfile updates the `prettier` resolution to the exact version. No other deps change.

- [ ] **Step 4: Verify format check is clean**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm format:check
```

Expected: `All matched files use Prettier code style!` (or equivalent green output).

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/package.json frontend/pnpm-lock.yaml && git commit -m "chore(frontend): pin prettier exactly to stop format/format:check drift"
```

---

### Task 0d: Resolve the 7 mypy `# type: ignore` comments from Plan D

**Files:**
- Modify: `backend/apps/common/models.py`
- Modify: `backend/apps/accounts/managers.py`
- Modify: `backend/apps/orgs/models.py`
- Modify: `backend/apps/accounts/services.py`
- Modify: `backend/apps/accounts/views.py`

**Background:** Plan D's CI fixup added `# type: ignore[code]` to 7 lines after `django-stubs` got stricter. Each is a real annotation gap.

- [ ] **Step 1: Locate the 7 ignores**

```bash
cd /Users/vinei/Projects/eventgate/backend && grep -rn "# type: ignore" apps/ | grep -v migrations
```

Expected: 7 lines, all in the files listed above. Capture the file + line + code.

- [ ] **Step 2: For each ignore, write a real annotation**

The typical fixes:

- `apps/common/models.py` — `OrgScopedModel.objects` likely needs `objects: ClassVar[models.Manager["Self"]] = models.Manager()` with a quoted-string forward reference. If the original was an `abstract = True` model, the fix is to mark the manager class-variable so `django-stubs` knows it's not an instance attribute.
- `apps/accounts/managers.py` — `UserManager.create_user` likely needs `-> "User"` with a TYPE_CHECKING import of `User`.
- `apps/orgs/models.py` — likely `objects: ClassVar` on the model's manager, same pattern as above.
- `apps/accounts/services.py` — likely a generic `dict[str, Any]` that needs to be a `TypedDict` or a `cast()`.
- `apps/accounts/views.py` — likely a DRF view's `serializer_class` or a `request.user` access that needs `cast(User, request.user)`.

For each line, remove the ignore, add the real annotation/cast, and verify with:

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run mypy apps/<file>.py
```

Expected: no errors on that file.

- [ ] **Step 3: Run full mypy**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run mypy apps/
```

Expected: `Success: no issues found in N source files`.

- [ ] **Step 4: Run full pytest**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~155 tests, all green. The annotation fixes are runtime no-ops.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add backend/apps/ && git commit -m "refactor(types): resolve 7 plan-d mypy ignores with real annotations"
```

---

## Task 1 — Backend: `GET /guests/sync/` endpoint

**Files:**
- Create: `backend/apps/guests/serializers.py` (modify — add `GuestSyncSerializer` if file already exists; else create)
- Modify: `backend/apps/guests/views.py`
- Modify: `backend/apps/guests/urls.py`
- Create: `backend/tests/test_guests_sync_endpoint.py`

**TDD discipline: red → green → commit.**

- [ ] **Step 1: Write the failing test (the projection + auth)**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_guests_sync_endpoint.py`:

```python
"""Sync endpoint for the scanner PWA. Minimal projection, scanner-session-auth."""

from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.devices.models import EventPinSession, ScannerDevice
from apps.devices.services import _hash_token
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def org_event_device_session(db):
    """Mint an org + event + scanner device + active session in one go."""
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate 1",
        role="scanner",
        device_token_hash=_hash_token("device-token-raw"),
    )
    raw_session = "session-token-raw"
    session = EventPinSession.objects.create(
        device=device,
        session_token_hash=_hash_token(raw_session),
        expires_at=timezone.now() + timezone.timedelta(hours=8),
    )
    return org, event, device, session, raw_session


@pytest.mark.django_db
def test_guests_sync_returns_minimal_projection(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Alice Example",
        email="alice@example.com",
        entry_token="raw-token-1",
        entry_status="registered_not_arrived",
        info_status="info_completed",
    )

    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")

    assert res.status_code == 200
    body = res.json()
    assert "guests" in body
    assert "cursor" in body
    assert len(body["guests"]) == 1
    row = body["guests"][0]
    assert set(row.keys()) == {
        "id", "entry_token", "full_name", "email",
        "guest_type", "entry_status", "info_status", "updated_at",
    }
    assert row["entry_token"] == "raw-token-1"
    assert row["id"] == str(guest.id)


@pytest.mark.django_db
def test_guests_sync_rejects_without_session(client, org_event_device_session):
    org, event, *_ = org_event_device_session
    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url)
    assert res.status_code == 401


@pytest.mark.django_db
def test_guests_sync_since_returns_only_newer_rows(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    # Old guest — should be filtered out
    old = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="Old", email="old@example.com", entry_token="t-old",
    )
    cursor = (old.updated_at + timezone.timedelta(seconds=1)).isoformat()
    Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="New", email="new@example.com", entry_token="t-new",
    )

    url = reverse("guest-sync", args=[org.slug, event.slug]) + f"?since={cursor}"
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert res.status_code == 200
    body = res.json()
    names = {g["full_name"] for g in body["guests"]}
    assert names == {"New"}


@pytest.mark.django_db
def test_guests_sync_etag_returns_304(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="A", email="a@example.com", entry_token="t-a",
    )
    url = reverse("guest-sync", args=[org.slug, event.slug])
    first = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert first.status_code == 200
    etag = first["ETag"]
    second = client.get(
        url,
        HTTP_AUTHORIZATION=f"Bearer {raw_session}",
        HTTP_IF_NONE_MATCH=etag,
    )
    assert second.status_code == 304


@pytest.mark.django_db
def test_guests_sync_returns_guests_for_this_event_only(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    other_event = Event.objects.create(organization=org, name="Other", slug="other")
    Guest.objects.create(
        organization=org, event=other_event, guest_type="pre_registered",
        full_name="Other Guest", email="other@example.com", entry_token="t-other",
    )
    Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="This Guest", email="this@example.com", entry_token="t-this",
    )
    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert res.status_code == 200
    names = {g["full_name"] for g in res.json()["guests"]}
    assert names == {"This Guest"}
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_guests_sync_endpoint.py -v
```

Expected: 5 FAIL (NoReverseMatch on `guest-sync`).

- [ ] **Step 3: Add the serializer**

Open `/Users/vinei/Projects/eventgate/backend/apps/guests/serializers.py` (or create if missing). Append:

```python
from rest_framework import serializers

from apps.guests.models import Guest


class GuestSyncSerializer(serializers.ModelSerializer):
    """Minimal guest projection for the scanner cache.

    Carries the fields the offline path needs to validate a scanned token
    locally and render a "QUEUED" optimistic result card. Excludes anything
    PII-heavier than name/email (e.g. registration_data) — that stays
    server-side and the scanner pulls it only after the staffer reaches the
    online help-desk path.
    """

    id = serializers.UUIDField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Guest
        fields = (
            "id",
            "entry_token",
            "full_name",
            "email",
            "guest_type",
            "entry_status",
            "info_status",
            "updated_at",
        )
```

- [ ] **Step 4: Add the view**

Open `/Users/vinei/Projects/eventgate/backend/apps/guests/views.py`. Add at the top of the imports:

```python
import hashlib
from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.devices.auth import SessionTokenAuthentication
from apps.events.models import Event
from apps.guests.serializers import GuestSyncSerializer
```

Then append the view class:

```python
class GuestSyncView(APIView):
    """GET /api/v1/orgs/<org>/events/<event>/guests/sync/?since=<iso>

    Returns the minimal guest projection for this event, optionally filtered
    to rows changed after `since`. Authenticated by scanner session token.

    Response shape:
        {
            "guests": [GuestSyncSerializer, …],
            "cursor": "<iso8601>"   ← max updated_at across returned rows
        }

    The response carries an ETag of `sha1(cursor)`. Clients should resend
    that ETag as If-None-Match to get a 304 when nothing changed.
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # session auth enforces it

    def get(self, request, org_slug: str, event_slug: str):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        event = get_object_or_404(Event, organization=device.organization, slug=event_slug)
        if device.event_id != event.id:
            return Response({"detail": "Device not paired to this event."}, status=403)

        qs = device.event.guest_set.all()
        since_raw = request.query_params.get("since")
        if since_raw:
            since = parse_datetime(since_raw)
            if since is None:
                return Response({"detail": "Invalid 'since' parameter."}, status=400)
            qs = qs.filter(updated_at__gte=since)

        rows = list(qs.order_by("updated_at"))
        if rows:
            max_updated = max(r.updated_at for r in rows)
        else:
            max_updated = parse_datetime(since_raw) if since_raw else datetime.min
        cursor_iso = max_updated.isoformat() if isinstance(max_updated, datetime) else ""
        etag = hashlib.sha1(cursor_iso.encode("utf-8")).hexdigest() if cursor_iso else "empty"

        if_none_match = request.META.get("HTTP_IF_NONE_MATCH")
        if if_none_match and if_none_match.strip('"') == etag:
            res = Response(status=304)
            res["ETag"] = etag
            return res

        body = {
            "guests": GuestSyncSerializer(rows, many=True).data,
            "cursor": cursor_iso,
        }
        res = Response(body)
        res["ETag"] = etag
        return res
```

- [ ] **Step 5: Wire the URL**

Open `/Users/vinei/Projects/eventgate/backend/apps/guests/urls.py`. Add to imports:

```python
from apps.guests.views import GuestSyncView
```

Append to `urlpatterns`:

```python
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/sync/",
        GuestSyncView.as_view(),
        name="guest-sync",
    ),
```

- [ ] **Step 6: Run the test, confirm it passes**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_guests_sync_endpoint.py -v
```

Expected: 5 PASS.

- [ ] **Step 7: Confirm the full suite is still green**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~160 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add backend/ && git commit -m "feat(guests): GET /guests/sync/ for scanner offline cache (since + ETag)"
```

---

## Task 2 — Backend: `POST /scanner/escalations/` endpoint

**Files:**
- Create: `backend/apps/scanner/__init__.py`
- Create: `backend/apps/scanner/apps.py`
- Create: `backend/apps/scanner/views.py`
- Create: `backend/apps/scanner/urls.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_scanner_escalation_endpoint.py`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_scanner_escalation_endpoint.py`:

```python
"""Scanner escalation endpoint — emits a help_desk_escalation audit row."""

from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.devices.models import EventPinSession, ScannerDevice
from apps.devices.services import _hash_token
from apps.events.models import Event
from apps.orgs.models import Organization


@pytest.fixture
def session(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    device = ScannerDevice.objects.create(
        organization=org, event=event, label="Gate 1", role="scanner",
        device_token_hash=_hash_token("dt"),
    )
    raw = "sess-raw"
    EventPinSession.objects.create(
        device=device,
        session_token_hash=_hash_token(raw),
        expires_at=timezone.now() + timezone.timedelta(hours=8),
    )
    return org, event, device, raw


@pytest.mark.django_db
def test_escalation_writes_audit_row(client, session):
    org, event, device, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={
            "token": "raw-token-x",
            "reason": "scanner_offline_conflict",
            "original_payload": {"gate": "Gate 1", "scanner_label": "Gate 1"},
            "conflict_payload": {"gate": "Gate 2", "scanner_label": "Gate 2"},
        },
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 201
    audit = AuditEvent.objects.filter(action="checkin.help_desk_escalation").first()
    assert audit is not None
    assert audit.event_id == event.id
    assert audit.actor_type == "scanner_device"
    assert audit.actor_id == str(device.id)
    assert audit.result == "warning"
    assert audit.entry_token == "raw-token-x"
    details = audit.details_json
    assert details["reason"] == "scanner_offline_conflict"
    assert details["original_payload"]["gate"] == "Gate 1"
    assert details["conflict_payload"]["gate"] == "Gate 2"


@pytest.mark.django_db
def test_escalation_rejects_without_session(client, session):
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"token": "x", "reason": "y"},
        content_type="application/json",
    )
    assert res.status_code == 401


@pytest.mark.django_db
def test_escalation_rejects_missing_token(client, session):
    *_, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"reason": "scanner_offline_conflict"},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 400
    assert "token" in res.json()["detail"].lower()
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_scanner_escalation_endpoint.py -v
```

Expected: 3 FAIL (NoReverseMatch).

- [ ] **Step 3: Create the app skeleton**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/scanner
touch /Users/vinei/Projects/eventgate/backend/apps/scanner/__init__.py
```

Create `/Users/vinei/Projects/eventgate/backend/apps/scanner/apps.py`:

```python
from django.apps import AppConfig


class ScannerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.scanner"
```

- [ ] **Step 4: Add the view**

Create `/Users/vinei/Projects/eventgate/backend/apps/scanner/views.py`:

```python
"""Scanner-role endpoints — currently just escalation.

Each endpoint is gated by SessionTokenAuthentication and validates that the
device's role permits the action. Endpoints here are intended to be called
*by* the scanner PWA, not by the organizer dashboard.
"""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.devices.auth import SessionTokenAuthentication


class EscalationView(APIView):
    """POST /api/v1/scanner/escalations/

    Body:
        {
            "token": "<raw entry_token>",
            "reason": "scanner_offline_conflict" | "manual",
            "original_payload": {…},   ← what the scanner tried to write
            "conflict_payload": {…}    ← what the server reported instead
        }

    Writes a single AuditEvent (action=checkin.help_desk_escalation) which
    Plan F's help-desk inbox will read.
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth class enforces it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"detail": "token is required."}, status=400)
        reason = (request.data.get("reason") or "manual").strip()
        original_payload = request.data.get("original_payload") or {}
        conflict_payload = request.data.get("conflict_payload") or {}

        audit = write_audit(
            organization=device.organization,
            event=device.event,
            actor_type="scanner_device",
            actor_id=str(device.id),
            action="checkin.help_desk_escalation",
            result="warning",
            entry_token=token[:128],
            details={
                "reason": reason,
                "original_payload": original_payload,
                "conflict_payload": conflict_payload,
                "device_label": device.label,
            },
        )
        return Response({"escalation_id": str(audit.id)}, status=201)
```

- [ ] **Step 5: Wire the URL**

Create `/Users/vinei/Projects/eventgate/backend/apps/scanner/urls.py`:

```python
from django.urls import path

from apps.scanner.views import EscalationView

urlpatterns = [
    path("scanner/escalations/", EscalationView.as_view(), name="scanner-escalation"),
]
```

- [ ] **Step 6: Register the app**

Open `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`. In `INSTALLED_APPS`, add `"apps.scanner"` next to `"apps.walkins"`.

- [ ] **Step 7: Include the URL module**

Open `/Users/vinei/Projects/eventgate/backend/config/urls.py`. Find the block where `api/v1/` namespaces are wired (likely a list of `path("api/v1/", include("apps.<name>.urls"))` lines). Add:

```python
    path("api/v1/", include("apps.scanner.urls")),
```

- [ ] **Step 8: Run the test, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_scanner_escalation_endpoint.py -v
```

Expected: 3 PASS.

- [ ] **Step 9: Run full suite**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~163 tests, 0 failures.

- [ ] **Step 10: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add backend/ && git commit -m "feat(scanner): POST /scanner/escalations/ writes help_desk_escalation audit"
```

---

## Task 3 — Backend: emit `checkin.conflict` audit on cross-device duplicates

**Files:**
- Modify: `backend/apps/checkins/services.py`
- Create: `backend/tests/test_checkin_conflict_audit.py`

**Background:** Today, `perform_checkin` raises `CheckinFailure(409)` on duplicates with audit `action="checkin.duplicate"`. That covers the "same device re-scanned the same QR" case (no conflict — staffer just sees an amber card). It does NOT distinguish the more interesting case: an offline scanner flushes its queue, hits a guest who was already checked in by a *different* device while it was offline. That's a real conflict and Plan F's help-desk inbox needs to see it.

This task adds a second audit row (`action="checkin.conflict"`) when the existing checkin's `gate`+`scanner` differ from the incoming attempt's `gate`+`scanner_label`. The existing `checkin.duplicate` row continues to fire — the conflict row is **additional**, so the audit chain stays linear and Plan F can read either filter.

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_checkin_conflict_audit.py`:

```python
"""When a duplicate checkin originates from a different device/gate, emit a
separate checkin.conflict audit row in addition to the standard
checkin.duplicate row. Plan F's help-desk inbox reads this signal."""

from __future__ import annotations

import pytest
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.checkins.services import CheckinFailure, perform_checkin
from apps.devices.models import ScannerDevice
from apps.devices.services import _hash_token
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def event_with_two_devices(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    a = ScannerDevice.objects.create(
        organization=org, event=event, label="Gate 1", role="scanner",
        device_token_hash=_hash_token("a"),
    )
    b = ScannerDevice.objects.create(
        organization=org, event=event, label="Gate 2", role="scanner",
        device_token_hash=_hash_token("b"),
    )
    guest = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="Alice", email="a@example.com", entry_token="raw-token",
        entry_status="registered_not_arrived",
    )
    return org, event, a, b, guest


@pytest.mark.django_db
def test_conflict_audit_when_second_device_replays(event_with_two_devices):
    _org, _event, a, b, _guest = event_with_two_devices

    # First device checks Alice in.
    body, code = perform_checkin(
        device=a, token="raw-token", gate="Gate 1", scanner_label="Gate 1",
        client_idempotency_key="key-a",
    )
    assert code == 200

    # Second device replays an offline mutation against the same token.
    with pytest.raises(CheckinFailure) as exc_info:
        perform_checkin(
            device=b, token="raw-token", gate="Gate 2", scanner_label="Gate 2",
            client_idempotency_key="key-b",
        )
    assert exc_info.value.http_status == 409

    # Both rows present.
    actions = list(
        AuditEvent.objects.filter(entry_token__startswith="raw-token")
        .order_by("occurred_at")
        .values_list("action", flat=True)
    )
    assert actions == ["checkin.success", "checkin.duplicate", "checkin.conflict"]

    conflict = AuditEvent.objects.get(action="checkin.conflict")
    assert conflict.result == "warning"
    assert conflict.actor_id == str(b.id)
    assert conflict.gate == "Gate 2"
    assert conflict.details_json["original_gate"] == "Gate 1"
    assert conflict.details_json["original_scanner"] == "Gate 1"


@pytest.mark.django_db
def test_no_conflict_audit_when_same_device_replays(event_with_two_devices):
    """Same device + same gate replaying = self-replay, no conflict row."""
    _org, _event, a, _b, _guest = event_with_two_devices

    body, code = perform_checkin(
        device=a, token="raw-token", gate="Gate 1", scanner_label="Gate 1",
        client_idempotency_key="key-1",
    )
    assert code == 200
    # Note: the idempotency key changes (the client may re-enqueue if it
    # missed the response). Use a different key so we miss the cache and
    # actually exercise the duplicate path.
    with pytest.raises(CheckinFailure) as exc_info:
        perform_checkin(
            device=a, token="raw-token", gate="Gate 1", scanner_label="Gate 1",
            client_idempotency_key="key-2",
        )
    assert exc_info.value.http_status == 409

    assert not AuditEvent.objects.filter(action="checkin.conflict").exists()
    # The duplicate row is still there:
    assert AuditEvent.objects.filter(action="checkin.duplicate").count() == 1
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_checkin_conflict_audit.py -v
```

Expected: 2 FAIL (no `checkin.conflict` row written).

- [ ] **Step 3: Modify the service**

Open `/Users/vinei/Projects/eventgate/backend/apps/checkins/services.py`. Inside `perform_checkin`, locate the `if duplicate:` block. Replace it with:

```python
    if duplicate:
        write_audit(
            organization=device.organization,
            event=device.event,
            guest=guest,
            actor_type="scanner_device",
            actor_id=str(device.id),
            action="checkin.duplicate",
            result="warning",
            previous_status=guest.entry_status,
            new_status=guest.entry_status,
            gate=gate,
            scanner=scanner_label,
            entry_token=token[:32],
        )
        # If the existing check-in was performed by a different device/gate,
        # emit an additional checkin.conflict row. Plan F's help-desk inbox
        # filters on this action to surface offline-vs-online race conditions.
        if (guest.gate or "") != (gate or "") or (guest.scanner or "") != (scanner_label or ""):
            write_audit(
                organization=device.organization,
                event=device.event,
                guest=guest,
                actor_type="scanner_device",
                actor_id=str(device.id),
                action="checkin.conflict",
                result="warning",
                previous_status=guest.entry_status,
                new_status=guest.entry_status,
                gate=gate,
                scanner=scanner_label,
                entry_token=token[:32],
                details={
                    "original_gate": guest.gate,
                    "original_scanner": guest.scanner,
                    "original_checked_in_at": (
                        guest.checked_in_at.isoformat() if guest.checked_in_at else None
                    ),
                },
            )
        raise CheckinFailure(
            {
                "status": "duplicate",
                "guest": _serialize_guest(guest),
                "detail": f"Already in state {guest.entry_status}.",
            },
            409,
        )
```

- [ ] **Step 4: Update `write_audit` call signature if needed**

The existing `write_audit` already accepts `details=` (see `apps/audit/services.py`). No changes there.

- [ ] **Step 5: Run, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_checkin_conflict_audit.py -v
```

Expected: 2 PASS.

- [ ] **Step 6: Run full suite**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~165 tests, 0 failures. The existing `test_checkin_happy.py` / `test_checkin_idempotent.py` continue to pass — they all use the same device, so no extra row is written.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add backend/ && git commit -m "feat(checkins): emit checkin.conflict audit row on cross-device duplicates"
```

---

## Task 4 — Frontend: add Dexie + Workbox + Sentry + esbuild deps

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm add dexie@^4.0 workbox-precaching@^7.3 workbox-strategies@^7.3 workbox-routing@^7.3 workbox-core@^7.3 @sentry/nextjs@^8
```

Expected: 6 packages added; lockfile updated.

- [ ] **Step 2: Install dev dep**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm add -D esbuild@^0.24
```

Expected: 1 dev dep added.

- [ ] **Step 3: Confirm versions are pinned cleanly**

Open `/Users/vinei/Projects/eventgate/frontend/package.json` and confirm: each new entry uses caret-prefix (`^…`) consistent with the existing dep style. Prettier (from Task 0c) stays exact.

- [ ] **Step 4: Confirm install is clean**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm install --frozen-lockfile
```

Expected: zero changes, all deps resolved.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/package.json frontend/pnpm-lock.yaml && git commit -m "chore(frontend): add dexie + workbox + sentry + esbuild for offline scanner sync"
```

---

## Task 5 — Frontend: SW build script + Workbox-composed service worker

**Files:**
- Create: `frontend/app/sw.ts` (source, NOT a Next.js route — lives in `app/` for code organization only)
- Create: `frontend/scripts/build-sw.mjs`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/public/sw.js` (now build output, no longer hand-written)

> **Note on placement:** Next.js 16 has special-case handling for some files in `app/`. The Workbox source is **not** a route. We could put it at `frontend/sw-src/sw.ts` to avoid any Next.js indexing surprises. Place it at `frontend/sw-src/sw.ts` for safety. Adjust path below.

- [ ] **Step 1: Create the SW source**

Create directory + file:

```bash
mkdir -p /Users/vinei/Projects/eventgate/frontend/sw-src
```

Create `/Users/vinei/Projects/eventgate/frontend/sw-src/sw.ts`:

```ts
/**
 * Eventgate scanner — Workbox-composed service worker (Plan E).
 *
 * Three jobs:
 *
 *   1. Cache the Next.js static asset bundle so the scanner shell can boot
 *      with no network (the device may go offline between unlock and the
 *      first guest of the day).
 *
 *   2. Serve `/manifest.webmanifest`, `/sw.js`, `/icons/*`, and `/favicon.ico`
 *      from cache-first so the PWA install / icon paths never hit the network.
 *
 *   3. Stay out of the way of `/api/*`. The mutation queue lives in the page
 *      context (Dexie + the `sync.ts` loop) — the SW does NOT intercept POSTs,
 *      because we need bodied responses (gate / scanner conflict detection)
 *      and workbox-background-sync's BackgroundSyncPlugin replays headers-only.
 *
 * Compiled by `scripts/build-sw.mjs` to `public/sw.js`. Editing public/sw.js
 * directly is a build error — the script overwrites it on every build.
 */

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { clientsClaim, skipWaiting } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

skipWaiting();
clientsClaim();

// __WB_MANIFEST is replaced at build time by scripts/build-sw.mjs with the
// list of Next.js static assets. Empty stub here so TS doesn't complain.
precacheAndRoute(self.__WB_MANIFEST || []);

// PWA icons + manifest — cache-first, refresh in background.
registerRoute(
  ({ request, url }) =>
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icons/"),
  new CacheFirst({ cacheName: "eventgate-shell-v1" }),
);

// Next.js static chunks — network-first with a short cache fallback. This
// lets the scanner pick up new builds when online without breaking when
// offline.
registerRoute(
  ({ url }) => url.pathname.startsWith("/_next/static/"),
  new NetworkFirst({
    cacheName: "eventgate-next-static-v1",
    networkTimeoutSeconds: 3,
  }),
);

// IMPORTANT: do NOT register a fetch handler for /api/*. The mutation queue
// lives in the page context. See sw-src/sw.ts module docstring above.
```

- [ ] **Step 2: Create the build script**

Create `/Users/vinei/Projects/eventgate/frontend/scripts/build-sw.mjs`:

```js
#!/usr/bin/env node
/**
 * Bundle sw-src/sw.ts → public/sw.js with Workbox runtime inlined.
 *
 * We don't use workbox-build's generateSW because we want explicit control
 * over the runtime strategies. We DO populate __WB_MANIFEST with the Next.js
 * static asset list, but the actual hash is computed at build time and
 * substituted into the bundle.
 *
 * Run before `next build` (wired via next.config.ts).
 */

import { build } from "esbuild";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const FRONTEND_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const NEXT_STATIC = path.join(FRONTEND_ROOT, ".next", "static");
const SW_SOURCE = path.join(FRONTEND_ROOT, "sw-src", "sw.ts");
const SW_OUTPUT = path.join(FRONTEND_ROOT, "public", "sw.js");

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function buildManifest() {
  const files = await walk(NEXT_STATIC);
  return files.map((f) => ({
    url: "/" + path.relative(FRONTEND_ROOT, f).replace(/\\/g, "/").replace(/^\.next\//, "_next/"),
    revision: null, // Next.js fingerprints in the filename
  }));
}

async function main() {
  const manifest = await buildManifest();
  const manifestJson = JSON.stringify(manifest);
  console.log(`[build-sw] precaching ${manifest.length} static assets`);

  await build({
    entryPoints: [SW_SOURCE],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    outfile: SW_OUTPUT,
    define: {
      "self.__WB_MANIFEST": manifestJson,
    },
  });

  console.log(`[build-sw] wrote ${SW_OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Wire the build hook**

Open `/Users/vinei/Projects/eventgate/frontend/next.config.ts`. Add at the top (after imports):

```ts
import { execSync } from "node:child_process";

// Build the service worker after Next.js writes static assets but before
// the user's `next start` / Vercel serving picks up `public/`.
// We run synchronously in the build phase so the SW manifest reflects the
// current build's asset hashes.
if (process.env.NODE_ENV === "production" && !process.env.SW_BUILD_SKIP) {
  // Best-effort: skip during dev, run during prod build.
  // The actual invocation happens in a postbuild hook (see package.json).
}
```

Then open `/Users/vinei/Projects/eventgate/frontend/package.json` and modify `scripts`:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build && node scripts/build-sw.mjs",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
```

- [ ] **Step 4: Update the (deprecated) `public/sw.js`**

Add a guard at the top of `/Users/vinei/Projects/eventgate/frontend/public/sw.js` (will be overwritten on first build):

```js
// This file is generated by scripts/build-sw.mjs from sw-src/sw.ts.
// Do not edit. Run `pnpm build` to regenerate.
```

(The next `pnpm build` will overwrite the entire file — this is just defensive in case a developer runs the SW manually.)

- [ ] **Step 5: Run the build, confirm SW is written**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm build
```

Expected:
- Next.js build succeeds.
- Log line: `[build-sw] precaching N static assets` (N > 0).
- Log line: `[build-sw] wrote …/public/sw.js`.
- `head -c 200 public/sw.js` shows minified Workbox bundle.

- [ ] **Step 6: Confirm the SW still registers in dev**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dev
```

Open browser to `http://localhost:3000/scanner/`. DevTools → Application → Service Workers should show `sw.js` registered with status `activated`. The header should still show "● online".

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): Workbox-composed service worker via esbuild build step"
```

---

## Task 6 — Frontend: Dexie schema (`guests`, `mutation_queue`, `meta`)

**Files:**
- Create: `frontend/lib/scanner/db.ts`
- Create: `frontend/__tests__/lib/scanner/db.test.ts` (Vitest)

- [ ] **Step 1: Write the failing test**

Vitest doesn't ship with `fake-indexeddb` by default. First, add the test helper:

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm add -D fake-indexeddb@^6
```

Then create `/Users/vinei/Projects/eventgate/frontend/__tests__/lib/scanner/db.test.ts`:

```ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, type CachedGuest, type QueuedMutation } from "@/lib/scanner/db";

describe("scanner Dexie schema", () => {
  beforeEach(async () => {
    await db.guests.clear();
    await db.mutation_queue.clear();
    await db.meta.clear();
  });

  afterEach(async () => {
    await db.guests.clear();
    await db.mutation_queue.clear();
    await db.meta.clear();
  });

  it("stores and retrieves a guest by entry_token", async () => {
    const g: CachedGuest = {
      id: "00000000-0000-0000-0000-000000000001",
      entry_token: "raw-token-abc",
      full_name: "Alice",
      email: "alice@example.com",
      guest_type: "pre_registered",
      entry_status: "registered_not_arrived",
      info_status: "info_completed",
      updated_at: "2026-05-21T00:00:00Z",
    };
    await db.guests.put(g);
    const out = await db.guests.where("entry_token").equals("raw-token-abc").first();
    expect(out?.full_name).toBe("Alice");
  });

  it("enqueues + retrieves a mutation by status", async () => {
    const m: QueuedMutation = {
      id: "mut-1",
      mutation_type: "checkin",
      target_token: "raw-token-abc",
      client_idempotency_key: "idem-1",
      payload: {
        token: "raw-token-abc",
        gate: "Gate 1",
        scanner_label: "Gate 1",
        client_idempotency_key: "idem-1",
      },
      status: "pending",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: null,
      last_error: null,
      server_response: null,
    };
    await db.mutation_queue.put(m);
    const pending = await db.mutation_queue.where("status").equals("pending").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("mut-1");
  });

  it("meta table holds a single sync-cursor row", async () => {
    await db.meta.put({ key: "sync_cursor", value: "2026-05-21T00:00:00Z" });
    const cursor = await db.meta.get("sync_cursor");
    expect(cursor?.value).toBe("2026-05-21T00:00:00Z");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/db.test.ts
```

Expected: 3 FAIL (cannot resolve `@/lib/scanner/db`).

- [ ] **Step 3: Create the Dexie schema**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/db.ts`:

```ts
/**
 * Dexie schema for the scanner PWA.
 *
 * Three stores:
 *
 *   - guests          ← mirror of GuestSyncSerializer projection; keyed by
 *                       `entry_token` (also indexed by `id`). The scan path
 *                       looks up a token here before deciding online vs
 *                       offline behavior.
 *
 *   - mutation_queue  ← offline check-in writes. See QueuedMutation type
 *                       below for the full schema. Indexed by `status`
 *                       (for sync loop) and `[status+next_attempt_at]`
 *                       (for ordered drain).
 *
 *   - meta            ← single-row key/value table for sync cursor + ETag.
 *
 * Schema version 1 is the initial Plan E schema. Bumps happen in future
 * plans; document each bump's upgrade path inline.
 *
 * ALL Dexie access goes through this module. Other scanner modules import
 * the `db` singleton; they never construct their own Dexie instance.
 */

import Dexie, { type Table } from "dexie";

export type CachedGuest = {
  id: string;                  // server uuid
  entry_token: string;         // primary key — the QR payload
  full_name: string;
  email: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: string;
  info_status: string;
  updated_at: string;          // iso8601
};

export type MutationStatus =
  | "pending"
  | "in_flight"
  | "completed"
  | "conflict"
  | "failed"
  | "escalated";

export type CheckinPayload = {
  token: string;
  gate: string;
  scanner_label: string;
  client_idempotency_key: string;
};

export type QueuedMutation = {
  id: string;                          // client uuid
  mutation_type: "checkin";            // extension point
  target_token: string;                // denormalized
  client_idempotency_key: string;
  payload: CheckinPayload;
  status: MutationStatus;
  attempts: number;
  next_attempt_at: number;             // epoch ms
  created_at: number;                  // epoch ms
  completed_at: number | null;
  last_error: string | null;
  server_response: unknown | null;
};

export type MetaRow = {
  key: string;                         // e.g. "sync_cursor", "etag"
  value: string;
};

class ScannerDB extends Dexie {
  guests!: Table<CachedGuest, string>;          // PK: entry_token
  mutation_queue!: Table<QueuedMutation, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("eventgate_scanner_v1");
    this.version(1).stores({
      // Dexie uses "&" for primary key, "+" for auto-increment, indexes after.
      guests: "&entry_token, id, entry_status, updated_at",
      mutation_queue: "&id, status, [status+next_attempt_at], target_token, created_at",
      meta: "&key",
    });
  }
}

export const db = new ScannerDB();
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/db.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): Dexie schema for guests + mutation_queue + meta"
```

---

## Task 7 — Frontend: initial guest cache snapshot at unlock

**Files:**
- Create: `frontend/lib/scanner/guest-cache.ts`
- Modify: `frontend/app/scanner/unlock/page.tsx` (call `primeGuestCache` after successful unlock)
- Create: `frontend/__tests__/lib/scanner/guest-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/frontend/__tests__/lib/scanner/guest-cache.test.ts`:

```ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/scanner/db";
import { primeGuestCache, lookupGuestByToken } from "@/lib/scanner/guest-cache";

describe("guest cache priming + lookup", () => {
  beforeEach(async () => {
    await db.guests.clear();
    await db.meta.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("seeds the cache from the sync endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          guests: [
            {
              id: "g1",
              entry_token: "tok-1",
              full_name: "Alice",
              email: "a@example.com",
              guest_type: "pre_registered",
              entry_status: "registered_not_arrived",
              info_status: "info_completed",
              updated_at: "2026-05-21T10:00:00Z",
            },
          ],
          cursor: "2026-05-21T10:00:00Z",
        }),
        { status: 200, headers: { ETag: '"abcd"' } },
      ),
    );

    await primeGuestCache({
      orgSlug: "acme",
      eventSlug: "door",
      sessionToken: "sess",
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const all = await db.guests.toArray();
    expect(all).toHaveLength(1);
    const cursor = await db.meta.get("sync_cursor");
    expect(cursor?.value).toBe("2026-05-21T10:00:00Z");
    const etag = await db.meta.get("etag");
    expect(etag?.value).toBe('"abcd"');
  });

  it("lookupGuestByToken returns null when not cached", async () => {
    const hit = await lookupGuestByToken("never-seen");
    expect(hit).toBeNull();
  });

  it("lookupGuestByToken returns the cached row", async () => {
    await db.guests.put({
      id: "g1", entry_token: "tok-1",
      full_name: "Bob", email: "b@example.com",
      guest_type: "pre_registered",
      entry_status: "registered_not_arrived",
      info_status: "info_completed",
      updated_at: "2026-05-21T10:00:00Z",
    });
    const hit = await lookupGuestByToken("tok-1");
    expect(hit?.full_name).toBe("Bob");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/guest-cache.test.ts
```

Expected: 3 FAIL.

- [ ] **Step 3: Implement `guest-cache.ts`**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/guest-cache.ts`:

```ts
/**
 * Guest cache — initial snapshot at unlock + incremental refresh thereafter.
 *
 * The cache lives in IndexedDB (see lib/scanner/db.ts) and is keyed by the
 * raw entry_token so the scan path can do a one-shot lookup before deciding
 * online vs offline behavior.
 */

import { db, type CachedGuest } from "./db";

type PrimeArgs = {
  orgSlug: string;
  eventSlug: string;
  sessionToken: string;
};

/**
 * Pull the full guest list for an event into IndexedDB. Called once after
 * a successful PIN unlock so the device has data before going offline.
 */
export async function primeGuestCache(args: PrimeArgs): Promise<void> {
  const res = await fetch(
    `/api/v1/orgs/${args.orgSlug}/events/${args.eventSlug}/guests/sync/`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${args.sessionToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`primeGuestCache: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { guests: CachedGuest[]; cursor: string };
  await db.transaction("rw", db.guests, db.meta, async () => {
    if (body.guests.length > 0) {
      await db.guests.bulkPut(body.guests);
    }
    await db.meta.put({ key: "sync_cursor", value: body.cursor });
    const etag = res.headers.get("ETag");
    if (etag) {
      await db.meta.put({ key: "etag", value: etag });
    }
  });
}

/**
 * Look up a guest by their raw entry_token. Returns null if not cached.
 * Called from the scan page on every detection.
 */
export async function lookupGuestByToken(token: string): Promise<CachedGuest | null> {
  const row = await db.guests.where("entry_token").equals(token).first();
  return row ?? null;
}

/**
 * Mutate the locally-cached guest's entry_status so the optimistic offline
 * scan path doesn't accept the same token twice. Called from
 * mutation-queue.ts::enqueueCheckin().
 */
export async function markCachedGuestCheckedIn(token: string): Promise<void> {
  await db.guests.where("entry_token").equals(token).modify((g) => {
    g.entry_status = "checked_in";
  });
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/guest-cache.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Hook into the unlock flow**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/unlock/page.tsx`. Locate the success branch (the one that saves the session + redirects to `/scanner/scan`). Add a call to `primeGuestCache` between the save and the redirect. Pseudocode of the change:

```ts
import { primeGuestCache } from "@/lib/scanner/guest-cache";

// … inside the unlock handler success branch:
saveSession({ session_token: res.session_token, expires_at: res.expires_at });
try {
  await primeGuestCache({
    orgSlug: device.org_slug,
    eventSlug: device.event_slug,
    sessionToken: res.session_token,
  });
} catch (err) {
  // Non-fatal: scanner still works online, the cache will fill on next refresh.
  console.warn("primeGuestCache failed", err);
}
router.replace("/scanner/scan");
```

Read the file first to confirm the exact location of the redirect, then insert the call there. Confirm the variable names match what the file already uses (`res` vs `unlockResponse`, etc.).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): prime guest cache on PIN unlock"
```

---

## Task 8 — Frontend: incremental cache refresh on reconnect + interval

**Files:**
- Modify: `frontend/lib/scanner/guest-cache.ts`
- Create: `frontend/lib/scanner/refresh-loop.ts`
- Modify: `frontend/__tests__/lib/scanner/guest-cache.test.ts` (add incremental cases)

- [ ] **Step 1: Add tests for incremental refresh**

Append to `/Users/vinei/Projects/eventgate/frontend/__tests__/lib/scanner/guest-cache.test.ts`:

```ts
import { refreshGuestCache } from "@/lib/scanner/guest-cache";

describe("incremental refresh", () => {
  beforeEach(async () => {
    await db.guests.clear();
    await db.meta.clear();
  });

  it("uses the stored cursor as ?since", async () => {
    await db.meta.put({ key: "sync_cursor", value: "2026-05-21T09:00:00Z" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ guests: [], cursor: "2026-05-21T09:00:00Z" }),
        { status: 200, headers: { ETag: '"v2"' } },
      ),
    );

    await refreshGuestCache({ orgSlug: "acme", eventSlug: "door", sessionToken: "s" });

    const call = fetchSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("since=2026-05-21T09%3A00%3A00Z");
  });

  it("on 304, leaves the cache untouched", async () => {
    await db.guests.put({
      id: "g1", entry_token: "tok-1", full_name: "Alice", email: "a@example.com",
      guest_type: "pre_registered", entry_status: "registered_not_arrived",
      info_status: "info_completed", updated_at: "2026-05-21T08:00:00Z",
    });
    await db.meta.put({ key: "sync_cursor", value: "2026-05-21T08:00:00Z" });
    await db.meta.put({ key: "etag", value: '"v1"' });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 304, headers: { ETag: '"v1"' } }),
    );

    await refreshGuestCache({ orgSlug: "acme", eventSlug: "door", sessionToken: "s" });
    const all = await db.guests.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].full_name).toBe("Alice");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/guest-cache.test.ts
```

Expected: 2 FAIL (refreshGuestCache not exported).

- [ ] **Step 3: Implement `refreshGuestCache`**

Append to `/Users/vinei/Projects/eventgate/frontend/lib/scanner/guest-cache.ts`:

```ts
/**
 * Incremental refresh. Sends the stored cursor as ?since and the stored
 * ETag as If-None-Match. Updates the cache + cursor + etag on 200; no-op
 * on 304.
 *
 * Called from refresh-loop.ts on (a) the `online` event, (b) `visibilitychange`
 * to "visible", (c) a 5-minute interval while the scanner shell is mounted.
 */
export async function refreshGuestCache(args: PrimeArgs): Promise<void> {
  const cursor = await db.meta.get("sync_cursor");
  const etag = await db.meta.get("etag");
  const u = new URL(
    `/api/v1/orgs/${args.orgSlug}/events/${args.eventSlug}/guests/sync/`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (cursor?.value) u.searchParams.set("since", cursor.value);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.sessionToken}`,
  };
  if (etag?.value) headers["If-None-Match"] = etag.value;

  const res = await fetch(u.pathname + u.search, { method: "GET", headers });

  if (res.status === 304) {
    return; // cache is current
  }
  if (!res.ok) {
    throw new Error(`refreshGuestCache: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { guests: CachedGuest[]; cursor: string };
  await db.transaction("rw", db.guests, db.meta, async () => {
    if (body.guests.length > 0) {
      await db.guests.bulkPut(body.guests);
    }
    if (body.cursor) {
      await db.meta.put({ key: "sync_cursor", value: body.cursor });
    }
    const newEtag = res.headers.get("ETag");
    if (newEtag) {
      await db.meta.put({ key: "etag", value: newEtag });
    }
  });
}
```

- [ ] **Step 4: Create the refresh loop module**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/refresh-loop.ts`:

```ts
/**
 * Refresh-loop wiring. Listens for online + visibility events and runs the
 * incremental refresh on an interval. Idempotent — multiple calls register
 * the same listener once via a singleton flag.
 */

import { refreshGuestCache } from "./guest-cache";
import { loadDevice, loadSession } from "./session";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let started = false;
let intervalId: number | null = null;

function tryRefresh() {
  const device = loadDevice();
  const session = loadSession();
  if (!device || !session) return;
  refreshGuestCache({
    orgSlug: device.org_slug,
    eventSlug: device.event_slug,
    sessionToken: session.session_token,
  }).catch((err) => {
    // Sentry breadcrumb only — not exception-worthy at this frequency.
    console.warn("refreshGuestCache failed", err);
  });
}

export function startRefreshLoop(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => tryRefresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") tryRefresh();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  intervalId = window.setInterval(tryRefresh, REFRESH_INTERVAL_MS);

  // Fire once immediately so the first refresh happens at start.
  tryRefresh();

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (intervalId) window.clearInterval(intervalId);
    intervalId = null;
  };
}
```

- [ ] **Step 5: Wire the loop into the scanner layout**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/layout.tsx`. In the existing `useEffect` (the one that registers the SW + handles auth redirect), add:

```ts
import { startRefreshLoop } from "@/lib/scanner/refresh-loop";

// inside the effect, after the SW registration call:
const stop = startRefreshLoop();
return () => stop();
```

(Read the file first to confirm the exact effect; add the cleanup if there isn't already one.)

- [ ] **Step 6: Run the tests, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/guest-cache.test.ts
```

Expected: 5 PASS (3 initial + 2 incremental).

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): incremental guest cache refresh (since cursor + ETag + reconnect)"
```

---

## Task 9 — Frontend: mutation queue module (enqueue + drain + status transitions)

**Files:**
- Create: `frontend/lib/scanner/mutation-queue.ts`
- Create: `frontend/__tests__/lib/scanner/mutation-queue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/frontend/__tests__/lib/scanner/mutation-queue.test.ts`:

```ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/scanner/db";
import {
  enqueueCheckin,
  getPendingMutations,
  drainQueueOnce,
  countByStatus,
} from "@/lib/scanner/mutation-queue";

const NOW = 1716_000_000_000; // 2024-05-18T05:20:00Z (stable anchor for tests)

describe("mutation queue", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    await db.mutation_queue.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enqueues a pending checkin", async () => {
    const id = await enqueueCheckin({
      token: "tok-1",
      gate: "Gate 1",
      scanner_label: "Gate 1",
    });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.client_idempotency_key).toBeTruthy();
    expect(row?.payload.token).toBe("tok-1");
  });

  it("drainQueueOnce marks 200 success as completed", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          guest: { id: "g1", full_name: "Alice", entry_status: "checked_in", gate: "Gate 1", scanner: "Gate 1" },
        }),
        { status: 200 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    const completed = await countByStatus("completed");
    expect(completed).toBe(1);
  });

  it("drainQueueOnce marks 409 from a DIFFERENT device as conflict", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "duplicate",
          guest: { id: "g1", full_name: "Alice", entry_status: "checked_in", gate: "Gate 2", scanner: "Gate 2" },
          detail: "Already in state checked_in.",
        }),
        { status: 409 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    expect(await countByStatus("conflict")).toBe(1);
    expect(await countByStatus("completed")).toBe(0);
  });

  it("drainQueueOnce marks 409 from the SAME device as completed (self-replay)", async () => {
    await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "duplicate",
          guest: { id: "g1", full_name: "Alice", entry_status: "checked_in", gate: "Gate 1", scanner: "Gate 1" },
        }),
        { status: 409 },
      ),
    );

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    expect(await countByStatus("completed")).toBe(1);
    expect(await countByStatus("conflict")).toBe(0);
  });

  it("drainQueueOnce retries with exponential backoff on 5xx", async () => {
    const id = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    // 1st backoff = 1000ms
    expect(row?.next_attempt_at).toBe(NOW + 1000);
  });

  it("after 8 failures, status flips to failed", async () => {
    const id = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    await db.mutation_queue.update(id, { attempts: 7 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    await drainQueueOnce({ sessionToken: "sess", deviceGate: "Gate 1", deviceScanner: "Gate 1" });
    const row = await db.mutation_queue.get(id);
    expect(row?.status).toBe("failed");
  });

  it("getPendingMutations returns rows whose next_attempt_at <= now", async () => {
    const a = await enqueueCheckin({ token: "tok-1", gate: "Gate 1", scanner_label: "Gate 1" });
    const b = await enqueueCheckin({ token: "tok-2", gate: "Gate 1", scanner_label: "Gate 1" });
    await db.mutation_queue.update(b, { next_attempt_at: NOW + 60_000 });

    const due = await getPendingMutations();
    const ids = due.map((m) => m.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/mutation-queue.test.ts
```

Expected: 7 FAIL (module not found).

- [ ] **Step 3: Implement `mutation-queue.ts`**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/mutation-queue.ts`:

```ts
/**
 * Mutation queue — offline check-in writes.
 *
 * Single writer to db.mutation_queue. Other modules READ via observables
 * (TBD; for now, snapshot via getPendingMutations / countByStatus).
 *
 * Status lifecycle:
 *
 *   pending  ──flush──▶  in_flight  ──200──▶  completed
 *                                    ──409+same gate──▶  completed (self-replay)
 *                                    ──409+different gate──▶  conflict
 *                                    ──404──▶  failed
 *                                    ──5xx / network──▶  pending (with backoff)
 *                                                          ── attempts >= 8 ─▶ failed
 *
 *   conflict ──"Send to help desk"──▶  escalated   (handled in lib/scanner/escalations.ts)
 *
 * After 24h in completed/escalated, rows are purged by the GC sweep
 * (also in this module).
 *
 * Backoff schedule (attempts → ms delay):
 *   1: 1000, 2: 2000, 3: 4000, 4: 8000, 5: 16000, 6: 32000, 7: 60000, 8: 60000
 */

import * as Sentry from "@sentry/nextjs";

import {
  db,
  type CheckinPayload,
  type MutationStatus,
  type QueuedMutation,
} from "./db";
import { markCachedGuestCheckedIn } from "./guest-cache";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000];
const MAX_ATTEMPTS = BACKOFF_MS.length;
const GC_TTL_MS = 24 * 60 * 60 * 1000;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type EnqueueInput = {
  token: string;
  gate: string;
  scanner_label: string;
};

/**
 * Enqueue an offline checkin. Returns the queue row id.
 *
 * The client_idempotency_key is generated here, NOT at flush time, so retries
 * use the same key and the server's Redis idempotency cache short-circuits
 * the second call into the cached success payload.
 */
export async function enqueueCheckin(input: EnqueueInput): Promise<string> {
  const id = uuid();
  const key = uuid();
  const payload: CheckinPayload = {
    token: input.token,
    gate: input.gate,
    scanner_label: input.scanner_label,
    client_idempotency_key: key,
  };
  const now = Date.now();
  const row: QueuedMutation = {
    id,
    mutation_type: "checkin",
    target_token: input.token,
    client_idempotency_key: key,
    payload,
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    created_at: now,
    completed_at: null,
    last_error: null,
    server_response: null,
  };
  await db.mutation_queue.put(row);

  // Optimistically mark the cached guest as checked_in so the next scan of
  // the same QR shows a "Duplicate" card locally instead of re-queueing.
  await markCachedGuestCheckedIn(input.token).catch(() => {});

  return id;
}

export async function countByStatus(status: MutationStatus): Promise<number> {
  return db.mutation_queue.where("status").equals(status).count();
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const now = Date.now();
  return db.mutation_queue
    .where("[status+next_attempt_at]")
    .between(["pending", -Infinity], ["pending", now], true, true)
    .toArray();
}

export async function getConflictMutations(): Promise<QueuedMutation[]> {
  return db.mutation_queue.where("status").equals("conflict").toArray();
}

type DrainArgs = {
  sessionToken: string;
  deviceGate: string;
  deviceScanner: string;
};

/**
 * Drain all due pending mutations once. Each mutation is processed
 * sequentially (in created_at order) so audit ordering is preserved.
 *
 * Returns the count of successful drains.
 */
export async function drainQueueOnce(args: DrainArgs): Promise<{
  ok: number;
  conflicts: number;
  failed: number;
}> {
  await gcCompleted();
  const due = (await getPendingMutations()).sort((a, b) => a.created_at - b.created_at);
  let ok = 0;
  let conflicts = 0;
  let failed = 0;

  for (const row of due) {
    await db.mutation_queue.update(row.id, { status: "in_flight" });
    let res: Response;
    try {
      res = await fetch("/api/v1/checkins/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.sessionToken}`,
        },
        body: JSON.stringify(row.payload),
      });
    } catch (err) {
      await scheduleRetry(row, (err as Error).message);
      failed += 0; // counted as still-pending; not surfaced
      continue;
    }

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      // body might be empty on 5xx; that's fine
    }

    if (res.status === 200) {
      await db.mutation_queue.update(row.id, {
        status: "completed",
        completed_at: Date.now(),
        server_response: body,
      });
      ok += 1;
    } else if (res.status === 409 && body?.guest) {
      const g = body.guest as { gate?: string; scanner?: string };
      const sameGate = (g.gate ?? "") === args.deviceGate;
      const sameScanner = (g.scanner ?? "") === args.deviceScanner;
      if (sameGate && sameScanner) {
        await db.mutation_queue.update(row.id, {
          status: "completed",
          completed_at: Date.now(),
          server_response: body,
        });
        ok += 1;
      } else {
        await db.mutation_queue.update(row.id, {
          status: "conflict",
          completed_at: Date.now(),
          server_response: body,
        });
        conflicts += 1;
      }
    } else if (res.status === 404) {
      await db.mutation_queue.update(row.id, {
        status: "failed",
        completed_at: Date.now(),
        last_error: "token_not_recognised",
        server_response: body,
      });
      failed += 1;
    } else {
      // 5xx, 401, other — retry with backoff
      await scheduleRetry(row, `${res.status} ${res.statusText}`);
    }
  }

  return { ok, conflicts, failed };
}

async function scheduleRetry(row: QueuedMutation, errMsg: string): Promise<void> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db.mutation_queue.update(row.id, {
      status: "failed",
      attempts,
      completed_at: Date.now(),
      last_error: errMsg,
    });
    try {
      Sentry.captureException(new Error("mutation_queue_exhausted"), {
        extra: { row_id: row.id, target_token: row.target_token, last_error: errMsg },
      });
    } catch {
      // Sentry not configured — ignore.
    }
    return;
  }
  const delay = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  await db.mutation_queue.update(row.id, {
    status: "pending",
    attempts,
    next_attempt_at: Date.now() + delay,
    last_error: errMsg,
  });
}

async function gcCompleted(): Promise<void> {
  const cutoff = Date.now() - GC_TTL_MS;
  await db.mutation_queue
    .where("status")
    .anyOf(["completed", "escalated"])
    .filter((r) => r.completed_at !== null && r.completed_at < cutoff)
    .delete();
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test __tests__/lib/scanner/mutation-queue.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): mutation queue (enqueue + drain + backoff + conflict detection)"
```

---

## Task 10 — Frontend: sync loop wiring + offline scan path

**Files:**
- Create: `frontend/lib/scanner/sync.ts`
- Modify: `frontend/app/scanner/scan/page.tsx`
- Modify: `frontend/app/scanner/layout.tsx`

- [ ] **Step 1: Sync loop module**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/sync.ts`:

```ts
/**
 * Sync loop — runs mutation-queue.drainQueueOnce on reconnect + interval.
 *
 * Wired into the scanner layout effect. Subscribes to `online` events,
 * `visibilitychange` to visible, and a 30s heartbeat. Idempotent — multiple
 * calls register listeners once.
 */

import { drainQueueOnce } from "./mutation-queue";
import { loadDevice, loadSession } from "./session";

const SYNC_INTERVAL_MS = 30_000;
let started = false;
let intervalId: number | null = null;

async function tryDrain() {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  const device = loadDevice();
  const session = loadSession();
  if (!device || !session) return;
  if (device.role !== "scanner") return; // only pre-reg scanners have a queue
  try {
    await drainQueueOnce({
      sessionToken: session.session_token,
      deviceGate: device.label ?? "",
      deviceScanner: device.label ?? "",
    });
  } catch (err) {
    console.warn("drainQueueOnce failed", err);
  }
}

export function startSyncLoop(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  const onOnline = () => tryDrain();
  const onVisibility = () => {
    if (document.visibilityState === "visible") tryDrain();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  intervalId = window.setInterval(tryDrain, SYNC_INTERVAL_MS);
  // Fire once immediately
  tryDrain();
  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (intervalId) window.clearInterval(intervalId);
    intervalId = null;
  };
}
```

- [ ] **Step 2: Update the scan page to route offline**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/scan/page.tsx`. Locate `submitToken`. Replace it with a version that branches on `navigator.onLine`:

```ts
import { enqueueCheckin } from "@/lib/scanner/mutation-queue";
import { lookupGuestByToken } from "@/lib/scanner/guest-cache";

// inside the component, replace submitToken:
const submitToken = useCallback(
  async (rawToken: string) => {
    if (!device) return;
    if (busy) return;
    setBusy(true);
    try {
      // Online — original path.
      if (navigator.onLine) {
        const result = await postCheckin({
          token: rawToken,
          gate: device.label ?? "",
          scanner_label: device.label ?? "",
          client_idempotency_key: uuid(),
        });
        setOutcome(result);
        if (result.kind === "session_expired") {
          setTimeout(() => router.replace("/scanner/unlock"), RESULT_CARD_MS);
        }
        return;
      }

      // Offline — validate against the cache + enqueue.
      const cached = await lookupGuestByToken(rawToken);
      if (!cached) {
        setOutcome({
          kind: "invalid",
          detail: "Token not in offline cache. Will validate on reconnect.",
        });
        // Still enqueue — let the server be the source of truth on reconnect.
        await enqueueCheckin({
          token: rawToken,
          gate: device.label ?? "",
          scanner_label: device.label ?? "",
        });
        return;
      }
      if (cached.entry_status === "checked_in") {
        setOutcome({
          kind: "duplicate",
          guest: {
            id: cached.id, full_name: cached.full_name, email: cached.email,
            guest_type: cached.guest_type, entry_status: cached.entry_status,
            info_status: cached.info_status, gate: "", scanner: "", checked_in_at: null,
          },
          detail: "Already checked in (offline cache).",
        });
        return;
      }
      await enqueueCheckin({
        token: rawToken,
        gate: device.label ?? "",
        scanner_label: device.label ?? "",
      });
      setOutcome({
        kind: "success",
        guest: {
          id: cached.id, full_name: cached.full_name, email: cached.email,
          guest_type: cached.guest_type, entry_status: "checked_in",
          info_status: cached.info_status, gate: device.label ?? "", scanner: device.label ?? "",
          checked_in_at: null,
        },
      });
    } finally {
      setBusy(false);
    }
  },
  [device, busy, router],
);
```

- [ ] **Step 3: Wire the sync loop in the layout**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/layout.tsx`. In the existing effect (already has SW registration + refresh loop after Task 8), add:

```ts
import { startSyncLoop } from "@/lib/scanner/sync";

// inside the effect, after startRefreshLoop():
const stopSync = startSyncLoop();
// return a cleanup that calls both stop functions:
return () => {
  stopRefresh();
  stopSync();
};
```

- [ ] **Step 4: Manual smoke-test in dev**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dev
```

Open `http://localhost:3000/scanner/`. Enroll + unlock + scan a known guest:
1. Confirm green "success" card online.
2. DevTools → Network → set "Offline".
3. Scan another guest. Confirm green optimistic card.
4. DevTools → Application → IndexedDB → `eventgate_scanner_v1` → `mutation_queue` shows 1 row, status=pending.
5. Set DevTools → Network back to "No throttling".
6. Within ~30s, the row should flip to status=completed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): offline scan path + reconnect sync loop"
```

---

## Task 11 — Frontend: header counters + offline banner

**Files:**
- Create: `frontend/components/scanner/offline-banner.tsx`
- Modify: `frontend/app/scanner/layout.tsx`
- Create: `frontend/lib/scanner/queue-observers.ts`

- [ ] **Step 1: Queue observers (small hook that polls Dexie)**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/queue-observers.ts`:

```ts
"use client";

/**
 * Small hooks that observe the mutation_queue.
 *
 * Dexie has its own observable layer, but pulling it in just for two counters
 * is overkill. A 1s poll while the layout is mounted is fine — Dexie reads
 * are cheap and the data fits in memory.
 */

import { useEffect, useState } from "react";

import { countByStatus } from "./mutation-queue";

export function useQueueCount(status: "pending" | "conflict" | "failed"): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const v = await countByStatus(status);
      if (alive) setN(v);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [status]);
  return n;
}
```

- [ ] **Step 2: Offline banner component**

Create `/Users/vinei/Projects/eventgate/frontend/components/scanner/offline-banner.tsx`:

```tsx
"use client";

import { useSyncExternalStore } from "react";

import { useQueueCount } from "@/lib/scanner/queue-observers";

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => navigator.onLine;
const getOnlineServer = () => true;

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  const pending = useQueueCount("pending");
  if (online) return null;
  return (
    <div className="border-b border-amber-600/40 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200">
      Working offline — {pending > 0 ? `${pending} scan${pending === 1 ? "" : "s"} queued, ` : ""}
      will sync when you reconnect.
    </div>
  );
}
```

- [ ] **Step 3: Update layout to show counters + banner**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/layout.tsx`. Modify the header right-hand status pill:

```tsx
import { OfflineBanner } from "@/components/scanner/offline-banner";
import { useQueueCount } from "@/lib/scanner/queue-observers";

// inside the component:
const pending = useQueueCount("pending");
const conflicts = useQueueCount("conflict");

// in the header:
<header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
  <span className="font-mono">Eventgate Scanner</span>
  <div className="flex items-center gap-3">
    {conflicts > 0 ? (
      <a
        href="/scanner/escalations"
        className="font-mono text-amber-300 hover:underline"
        aria-label={`${conflicts} conflicts pending escalation`}
      >
        ⚠ {conflicts} conflict{conflicts === 1 ? "" : "s"}
      </a>
    ) : null}
    <span
      className={online ? "font-mono text-green-400" : "font-mono text-amber-400"}
      aria-live="polite"
    >
      {online
        ? "● online"
        : `● offline${pending > 0 ? ` — ${pending} queued` : ""}`}
    </span>
  </div>
</header>
<OfflineBanner />
{children}
```

- [ ] **Step 4: Manual smoke test**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dev
```

Go offline → header pill shows "● offline — N queued"; banner appears below header. Manually insert a `conflict` row in DevTools → IndexedDB → mutation_queue (edit a completed row's status to "conflict"). Header pill shows "⚠ 1 conflict" linking to `/scanner/escalations`.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): header queue/conflict counters + offline banner"
```

---

## Task 12 — Frontend: `/scanner/escalations` page

**Files:**
- Create: `frontend/app/scanner/escalations/page.tsx`
- Create: `frontend/components/scanner/conflict-row.tsx`
- Create: `frontend/lib/scanner/escalations.ts`

- [ ] **Step 1: Escalations API helper**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/escalations.ts`:

```ts
"use client";

import { db, type QueuedMutation } from "./db";
import { loadSession } from "./session";

export async function escalateMutation(row: QueuedMutation): Promise<void> {
  const s = loadSession();
  if (!s) throw new Error("session_expired");

  const conflictPayload = row.server_response as { guest?: { gate?: string; scanner?: string } } | null;
  const res = await fetch("/api/v1/scanner/escalations/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.session_token}`,
    },
    body: JSON.stringify({
      token: row.target_token,
      reason: "scanner_offline_conflict",
      original_payload: row.payload,
      conflict_payload: {
        gate: conflictPayload?.guest?.gate ?? null,
        scanner: conflictPayload?.guest?.scanner ?? null,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`escalate: ${res.status} ${res.statusText}`);
  }
  await db.mutation_queue.update(row.id, {
    status: "escalated",
    completed_at: Date.now(),
  });
}
```

- [ ] **Step 2: Conflict row component**

Create `/Users/vinei/Projects/eventgate/frontend/components/scanner/conflict-row.tsx`:

```tsx
"use client";

import { useState } from "react";

import { type QueuedMutation } from "@/lib/scanner/db";
import { escalateMutation } from "@/lib/scanner/escalations";

type Props = {
  row: QueuedMutation;
  onDone: () => void;
};

export function ConflictRow({ row, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const guest =
    (row.server_response as { guest?: { full_name?: string; gate?: string; scanner?: string } } | null)
      ?.guest ?? null;

  const handleEscalate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await escalateMutation(row);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-4 text-sm">
      <div className="mb-2 font-mono text-xs text-amber-300">CONFLICT</div>
      <div className="space-y-1">
        <div>
          <span className="text-neutral-400">Guest:</span>{" "}
          {guest?.full_name ?? "(unknown)"}
        </div>
        <div>
          <span className="text-neutral-400">Original (this device):</span>{" "}
          {row.payload.gate} / {row.payload.scanner_label}
        </div>
        <div>
          <span className="text-neutral-400">Server says:</span>{" "}
          {guest?.gate ?? "?"} / {guest?.scanner ?? "?"}
        </div>
        <div className="text-xs text-neutral-500">
          Scanned at {new Date(row.created_at).toLocaleTimeString()}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleEscalate}
        className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-neutral-950 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send to help desk"}
      </button>
      {err ? <p className="mt-2 text-xs text-red-400">{err}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Escalations page**

Create `/Users/vinei/Projects/eventgate/frontend/app/scanner/escalations/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { ConflictRow } from "@/components/scanner/conflict-row";
import { type QueuedMutation } from "@/lib/scanner/db";
import { getConflictMutations } from "@/lib/scanner/mutation-queue";

export default function EscalationsPage() {
  const [rows, setRows] = useState<QueuedMutation[]>([]);
  const refresh = useCallback(async () => {
    setRows(await getConflictMutations());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold">Escalations</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No conflicts. When an offline check-in clashes with another device,
          it shows up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <ConflictRow row={r} onDone={() => refresh()} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Manual end-to-end test**

In dev: go online → scan a guest → flip the DB row to `checked_in` from a different gate via admin → set the device offline → scan again → reconnect → the row should land in `/scanner/escalations`. Press "Send to help desk" → confirm a `checkin.help_desk_escalation` AuditEvent exists in Postgres.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): escalations page + Send to help desk affordance"
```

---

## Task 13 — Frontend: PWA install prompt

**Files:**
- Create: `frontend/lib/scanner/install.ts`
- Create: `frontend/components/scanner/install-button.tsx`
- Modify: `frontend/app/scanner/layout.tsx`

- [ ] **Step 1: Capture the install prompt**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/install.ts`:

```ts
"use client";

/**
 * Capture the `beforeinstallprompt` event so we can show our own "Install"
 * button. Chrome / Edge / Samsung Internet expose this; iOS Safari does not
 * (users must use the "Add to Home Screen" share sheet — the iOS path is
 * documented in onboarding, not surfaced from the app).
 */

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    canInstall: deferred !== null,
    install: async () => {
      const d = deferred;
      if (!d) return;
      await d.prompt();
      await d.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    },
  };
}
```

- [ ] **Step 2: Install button**

Create `/Users/vinei/Projects/eventgate/frontend/components/scanner/install-button.tsx`:

```tsx
"use client";

import { useInstallPrompt } from "@/lib/scanner/install";

export function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      onClick={install}
      className="rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-xs hover:bg-neutral-800"
    >
      Install
    </button>
  );
}
```

- [ ] **Step 3: Render in header**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/layout.tsx`. Add the import:

```tsx
import { InstallButton } from "@/components/scanner/install-button";
```

In the header's right-hand group (next to the conflict pill, before the online/offline pill):

```tsx
<InstallButton />
```

- [ ] **Step 4: Manual test**

Run dev server, open `http://localhost:3000/scanner/` in Chrome desktop. The "Install" button appears once Chrome's PWA install heuristics fire (you may need to interact with the page briefly). Click it → Chrome's install UI appears. Accept → button disappears.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): PWA install prompt button in header"
```

---

## Task 14 — Frontend: Sentry browser SDK init for the scanner shell

**Files:**
- Create: `frontend/lib/scanner/sentry.ts`
- Create: `frontend/sentry.client.config.ts`
- Modify: `frontend/app/scanner/layout.tsx`
- Modify: `frontend/next.config.ts` (wrap with Sentry plugin — optional, defer if it conflicts with existing config)

**Background:** Plans A–D did not initialize the browser Sentry SDK. Plan E is the first place client-side errors land in Sentry. Scope is limited to `/scanner/*` — we do not broadcast Sentry across the dashboard or public pages in this plan.

- [ ] **Step 1: Browser config**

Create `/Users/vinei/Projects/eventgate/frontend/sentry.client.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? "staging",
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,    // off by default — scanner pages are short
    replaysOnErrorSampleRate: 0.25, // capture replays on actual errors only
    integrations: [],               // keep the bundle tight; no Replay default
  });
}
```

- [ ] **Step 2: Init helper**

Create `/Users/vinei/Projects/eventgate/frontend/lib/scanner/sentry.ts`:

```ts
"use client";

/**
 * Dynamically import the Sentry browser SDK on the scanner shell only.
 * Keeps the dashboard / public-page bundle small.
 */

let initialized = false;

export async function initScannerSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  await import("../../sentry.client.config");
}
```

- [ ] **Step 3: Hook into the layout effect**

Open `/Users/vinei/Projects/eventgate/frontend/app/scanner/layout.tsx`. In the existing effect, add:

```ts
import { initScannerSentry } from "@/lib/scanner/sentry";

// inside the effect, very first line:
initScannerSentry().catch(() => {});
```

- [ ] **Step 4: Set the public env var**

In Vercel dashboard (or via CLI):

```bash
pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_DSN production
# (paste the DSN from Fly secrets — same DSN the backend uses)
pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_ENV production
# value: "production"
```

For staging preview deploys, also add to the preview environment.

- [ ] **Step 5: Smoke test**

Deploy to staging. From the scanner page, run in the browser console:

```js
window.Sentry?.captureException(new Error("plan-e smoke test"))
```

Confirm the error appears in Sentry.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate && git add frontend/ && git commit -m "feat(scanner): Sentry browser SDK init scoped to /scanner/*"
```

---

## Task 15 — Wire the conflict signal: backend `checkin.conflict` is observable

**Files:**
- Modify: `backend/apps/checkins/services.py` (already done in Task 3)
- Verification only

- [ ] **Step 1: Confirm the chain end-to-end with a manual scenario**

```text
1. Device A: enroll + unlock as scanner@Gate-1. Prime cache.
2. Take Device A OFFLINE.
3. Scan Alice's QR on Device A → optimistic green card, mutation enqueued.
4. (Server still has Alice in registered_not_arrived.)
5. Device B (separate scanner, online, paired to same event): scan Alice's QR
   from a paper printout → server marks Alice checked_in at Gate 2.
6. Bring Device A back ONLINE.
7. Within ~30s, the queue drains. The mutation hits 409 with guest.gate="Gate 2".
8. Mutation status flips to conflict. Header shows "⚠ 1 conflict".
9. Postgres: SELECT action FROM apps_audit_auditevent WHERE entry_token LIKE 'token-prefix%'
    expected: checkin.success (device B), checkin.duplicate (device A), checkin.conflict (device A).
10. Tap header pill → /scanner/escalations → "Send to help desk".
11. Postgres: a new row with action=checkin.help_desk_escalation, actor=device A.
```

- [ ] **Step 2: Confirm via SQL**

```bash
flyctl ssh console --app eventgate-backend-staging
# Inside the box:
python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
django.setup()
from apps.audit.models import AuditEvent
for r in AuditEvent.objects.filter(action__in=['checkin.success','checkin.duplicate','checkin.conflict','checkin.help_desk_escalation']).order_by('occurred_at')[:10]:
  print(r.occurred_at, r.action, r.entry_token[:8], r.actor_id, r.details_json.get('reason',''))
"
```

Expected: the four rows from Step 1.

- [ ] **Step 3: No commit — verification only**

(If a typo or schema issue surfaces, write the fix as a follow-on task; do not silently amend prior commits.)

---

## Task 16 — Verify the SW + queue against a real device in airplane mode

**Files:** none — verification only

- [ ] **Step 1: Deploy to a staging preview**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dlx vercel@latest --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects
```

(If Task 0b's auto-deploy fix is in place, this step is just: push and wait.)

- [ ] **Step 2: Pair a real phone**

On a real Android (Chrome) device:
1. Open the Vercel preview URL → `/scanner/enroll`.
2. Paste an enrollment code from the organizer dashboard → unlock with PIN.
3. Tap "Install" in the header → "Add to Home Screen" → confirm. PWA opens standalone.
4. Force-quit the PWA. Re-open from the home screen icon → it should boot offline (the shell loads from the SW cache).

- [ ] **Step 3: Airplane mode test**

1. Open the installed PWA → confirm cached guest count is reasonable (e.g. browser DevTools remote-debugging shows ~N rows in `db.guests`).
2. Toggle airplane mode ON.
3. Scan two QR codes — both should show green optimistic cards. Header reads "● offline — 2 queued".
4. Toggle airplane mode OFF.
5. Within ~30s, header reads "● online" and queue count drops to 0.
6. Confirm in Postgres that both check-ins landed with `gate`/`scanner` set to this device's label.

- [ ] **Step 4: Conflict test (two devices)**

1. With airplane mode ON on Device A, scan Alice. Queue holds 1 row.
2. On Device B (separate Chrome window, online), scan Alice's QR from another phone or a printout.
3. Toggle airplane mode OFF on Device A.
4. Wait ~30s. Header on Device A should now show "⚠ 1 conflict". Tap it → escalations page → "Send to help desk".
5. Confirm `checkin.help_desk_escalation` row in `AuditEvent`.

- [ ] **Step 5: No commit — verification only**

If any step fails, raise a follow-on task (do NOT mark Task 16 complete).

---

## Task 17 — End-to-end backend regression + frontend lint pass

**Files:** none — verification + fixups

- [ ] **Step 1: Backend full suite**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~165 tests passing (Plan D's ~155 + ~10 new from Tasks 1, 2, 3).

- [ ] **Step 2: Backend mypy**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run mypy apps/
```

Expected: `Success: no issues found in N source files`. (Task 0d cleared the 7 ignores; no new ones should be introduced.)

- [ ] **Step 3: Frontend Vitest**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm test
```

Expected: all `__tests__/lib/scanner/*` pass + any prior Vitest specs still pass.

- [ ] **Step 4: Frontend lint + format**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm lint && pnpm format:check
```

Expected: both clean. Task 0c pinned prettier, so `format:check` should not drift from `format`.

- [ ] **Step 5: Frontend build**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm build
```

Expected: Next.js build succeeds + the SW build script runs + `public/sw.js` is rewritten with the new bundle.

- [ ] **Step 6: Fix any failures inline**

If any of Steps 1–5 fail, address inline. Do not mark Task 17 complete until all five are green.

- [ ] **Step 7: No commit — verification only**

(Any code fixes get their own commit.)

---

## Task 18 — Completion log + handoff doc update

**Files:**
- Modify: This file (`docs/plans/2026-05-21-plan-e-offline-scanner-sync.md`) — add the completion log section below.
- Modify: `docs/handoff-2026-05-20.md` — append a Plan E entry.

- [ ] **Step 1: Write the completion log**

At the end of this plan file, fill in the **Completion Log** section (template below). Record dates, test counts, deviations, and the Plan F parking lot.

- [ ] **Step 2: Update the handoff doc**

Append to `/Users/vinei/Projects/eventgate/docs/handoff-2026-05-20.md` under "What's complete":

```markdown
### Plan E — Offline scanner sync

Workbox-composed SW (esbuild-bundled from `sw-src/sw.ts`), Dexie schema (`guests`, `mutation_queue`, `meta`), guest cache priming on unlock + incremental refresh on reconnect/visibility/interval, mutation queue with exponential backoff (1s→60s, max 8 attempts), cross-device conflict detection (server emits `checkin.conflict` audit row; client routes to `/scanner/escalations`), `POST /api/v1/scanner/escalations/` writes `checkin.help_desk_escalation` audit (Plan F inbox source), PWA install prompt + offline banner + queue/conflict header counters, browser Sentry init scoped to `/scanner/*`.

Operational cleanups from Plan D parking lot: `worker.restart=always` in `fly.toml`, Vercel auto-deploy reconnect, prettier version pinned, 7 mypy `# type: ignore` comments resolved.
```

Update the "What's NOT done" parking lot:
- Remove "Offline scanner sync — Plan E."
- Add new Plan F items (help-desk inbox UI, manual-review queue, dashboard polling, audit-viewer UI, DB append-only trigger on `audit_events`).

- [ ] **Step 3: Final commit**

```bash
cd /Users/vinei/Projects/eventgate && git add docs/ && git commit -m "docs(plan-e): mark complete; deviations + parking lot for Plan F"
git push
```

---

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| `fake-indexeddb` differs subtly from real Chromium IDB (e.g., transaction commit timing) | Tests assert on observable behavior (rows + counts), not on internal Dexie hooks. Staging verification (Task 16) covers the real-browser path. |
| Workbox cache invalidation drift between deploys | Tasks 5 + 16 verify: a new build rewrites the manifest, the SW activates after one reload, the precache claims new asset hashes. If a deploy strands a client on a stale cache, the staffer can clear via DevTools → unregister SW + reload. |
| Sync queue can pile up if backend is hard-down (404 returns failed; 5xx retries 8× over ~2 minutes then fails) | After 8 attempts, status flips to `failed` + Sentry exception. Plan F will add a UI affordance to retry-failed rows manually. |
| Self-replay detection assumes `gate` + `scanner_label` are stable for a device | They are — `device.label` is the single source of truth for both, set at enrollment + immutable from the scanner side. If we ever let staffers override the gate on the scanner, the self-replay check needs to be revisited. |
| `/guests/sync/` returns the entire event guest list on first prime — could be large | For Plan E target events (≤10k guests with the minimal projection ≈ 200 bytes/row → ~2MB), this is acceptable. Plan G's CSV import may push toward 50k; if so, add pagination there. |
| ETag uses sha1 of cursor only — clients with the same cursor but different filter (none used in Plan E) would collide | Acceptable — Plan E only has one filter (`since`). If query params expand, the ETag must include them. |
| Frontend Sentry adds bundle size to scanner pages | Init is dynamic-imported, so the cost lands only on `/scanner/*`. Bundle analysis after Task 14 should confirm <50KB gzipped added to the scanner route. |
| Conflict detection is **client-side** — relies on the client correctly comparing gate/scanner | Server also emits `checkin.conflict` audit row (Task 3) so the signal is durable even if the client mis-classifies. Plan F's inbox reads from server-side audit, not from client signals. |
| Workbox precache manifest stale between Next.js build and `build-sw.mjs` | The build script reads `.next/static/` AFTER `next build` finishes (Task 5 Step 3 wires `next build && node scripts/build-sw.mjs` sequentially). If a CI race exists, parallelize will not be added. |
| Browser PWA install prompt UX varies by OS / browser | Documented in Task 13. iOS Safari users get the "Add to Home Screen" share-sheet path, not an Install button. |

---

## Decision Heritage (newly locked-in this plan)

- **Offline scan path is a separate code branch**, not a transparent SW intercept. We need to inspect the 409 response body for conflict classification, and Workbox's `BackgroundSyncPlugin` is headers-only replay. So the queue lives in page context (Dexie + JS), not in the SW.
- **Single idempotency key per mutation**, generated at enqueue time (NOT at flush). Server-side Redis idempotency layer short-circuits replays into the cached success body. This is the same key returned by `client_idempotency_key` on the original POST.
- **Self-replay vs cross-device conflict** distinguished by comparing `guest.gate` + `guest.scanner` (server response) to the local device's `label`. If we ever decouple gate from device label, this rule must change.
- **Cache projection is intentionally minimal** — no `registration_data`, no PII beyond name + email. The scanner doesn't need it for token validation; richer info is fetched on-demand by the (future) help-desk lane.
- **ETag = sha1(cursor)**, not a content hash. Cheap, semantically correct for "no new rows since cursor X."
- **Sentry browser SDK is scoped to `/scanner/*` only.** Plan E does not turn it on for the dashboard or public registration. Dashboard/public Sentry is a Plan H (pilot-QA) decision.
- **No service worker fetch handler for `/api/*`** — the sync queue lives in the page context. The SW is for static asset caching only.
- **`apps.scanner` is reserved for scanner-role endpoints**, not the scanner PWA frontend (that's still `frontend/app/scanner/`). The naming is intentional.
- **Workbox is composed, not generated.** We bundle the runtime modules (`workbox-precaching`, `workbox-strategies`, `workbox-routing`, `workbox-core`) via esbuild. No `workbox-build` / no `next-pwa` / no `@serwist/next`. Keeps the build graph thin.
- **`checkin.help_desk_escalation` is an AuditEvent action**, not a dedicated table. Plan F may introduce a dedicated `HelpDeskTicket` table — at that point, migrate audit rows in a one-shot data migration.

---

## Intentionally NOT in Plan E

- ❌ Help-desk inbox UI (the screen organizer staff use to triage escalations). **Plan F.**
- ❌ Manual-review queue UI. **Plan F.**
- ❌ Dashboard polling counts. **Plan F.**
- ❌ Audit-viewer UI. **Plan F.**
- ❌ DB append-only trigger on `audit_events` (REVOKE UPDATE/DELETE for the app role). **Plan F.**
- ❌ Telegram QR delivery. **Plan G.**
- ❌ CSV guest import. **Plan G.**
- ❌ Khmer translator review pass for scanner + walkin strings. **Pilot QA (Plan H).**
- ❌ Resend sender-domain verification. **Pilot QA (manual dashboard work).**
- ❌ Tighten Fly `ALLOWED_HOSTS`. **Plan H.**
- ❌ Brand rename + domain swap. **Plan-0 pre-pilot.**
- ❌ Rate-limit on `POST /api/v1/scanner/escalations/`. Acceptable — session-token-gated + scanner-role-required.
- ❌ Walk-in flow offline support. **Out of scope for E.** The walk-in display device stays online — its 5s poll is its lifeline. If the walk-in display loses network, it stops showing new QRs (a degraded but recoverable state).
- ❌ Pagination on `/guests/sync/`. Acceptable at ≤10k event guests; revisit when an event needs more.
- ❌ ETag fingerprinting per-row. Bulk ETag (sha1 of cursor) is enough at this scale.

---

## Completion Log

- **Completed:** 2026-05-21
- **Verified end-to-end:** 2026-05-21 — see `docs/plans/2026-05-21-plan-e-verification-checklist.md` (the runbook) and `docs/plans/2026-05-21-plan-e-verification-findings.md` (the report). Pilot-ready verdict; 5 follow-up fix commits shipped during verification (`5190dcc`, `7638e4a`, `7b6f5e5`, `adbb3bc`, `d1ee5b6`); 9 items added to Plan F's parking lot. Sentry DSN env var + branded icons remain pre-pilot QA tasks.
- **Backend:** **172 tests passing** (`uv run pytest -q`), up from Plan D's ~155. Plan E added 10 new tests across `tests/test_guests_sync_endpoint.py` (5), `tests/test_scanner_escalation_endpoint.py` (3), `tests/test_checkin_conflict_audit.py` (2). One pre-existing flaky test (`test_checkin_concurrency.py::test_only_one_concurrent_checkin_wins`) intermittently fails due to shared-DB connection leakage — reproduces on `HEAD~N` and is unrelated to Plan E. `uv run mypy apps/` returns "Success: no issues found in 98 source files".
- **Frontend:** **19 Vitest cases** across 4 files (was 3 cases / 1 file at Plan D). Plan E added `__tests__/lib/scanner/db.test.ts` (3), `guest-cache.test.ts` (6), `mutation-queue.test.ts` (7). `pnpm lint` + `pnpm format:check` clean. `pnpm build` succeeds end-to-end — Next.js build emits all routes (`/scanner/escalations` is the new one) and the SW build script precaches 61 static assets into `public/sw.js`.
- **Deploy:** No new infrastructure. Plan D's worker process group on Fly continues; `worker.restart=always` now explicit in `fly.toml` (Task 0a). Vercel `rootDirectory` set to `frontend` via API (Task 0b — auto-deploys now reach `state=READY` instead of failing with `NEXT_NO_VERSION`). **Two env vars still need to be set on Vercel before browser Sentry becomes operational:** `NEXT_PUBLIC_SENTRY_DSN` (same DSN as the backend, available via `flyctl secrets list --app eventgate-backend-staging`) and optionally `NEXT_PUBLIC_SENTRY_ENV`. Add with `pnpm dlx vercel@latest env add NEXT_PUBLIC_SENTRY_DSN production --scope vineidev-4891s-projects` for both `production` and `preview`.

### Commits shipped (18 total)

```
c1da6df feat(scanner): Sentry browser SDK init scoped to /scanner/*
2340e95 feat(scanner): PWA install prompt button in header
bc43171 feat(scanner): escalations page + Send to help desk affordance
99867d9 feat(scanner): header queue/conflict counters + offline banner
408a446 feat(scanner): offline scan path + reconnect sync loop
dae78ad feat(scanner): mutation queue (enqueue + drain + backoff + conflict detection)
bce0567 feat(scanner): incremental guest cache refresh (since cursor + ETag + reconnect)
56ece44 feat(scanner): prime guest cache on PIN unlock
816ec2e feat(scanner): Dexie schema for guests + mutation_queue + meta
f76b1db feat(scanner): Workbox-composed service worker via esbuild build step
5010e30 chore(frontend): add dexie + workbox + sentry + esbuild for offline scanner sync
16cd14f feat(scanner): POST /scanner/escalations/ writes help_desk_escalation audit
b943824 feat(guests): GET /guests/sync/ for scanner offline cache (since + ETag)
5a284f4 feat(checkins): emit checkin.conflict audit row on cross-device duplicates
2695790 refactor(types): resolve 7 plan-d mypy ignores with real annotations
de839a4 docs(plan-e): vercel auto-deploy investigation findings
b943094 chore(frontend): pin prettier exactly to stop format/format:check drift
27649d6 ops(fly): worker.restart=always so worker Machine doesn't deploy as standby
```

### End-to-end verification (deferred to user)

The Plan E scenario script (Task 16's airplane-mode test + Task 15's three-device conflict signal) requires a real Android phone, a separate tablet/browser, and an active organizer account on staging. **It was not run as part of Plan E execution** — too dependent on physical hardware and human interaction. The scenario steps below are the authoritative pre-pilot acceptance test; the user should run them before declaring Plan E pilot-ready:

```text
1. Enroll + unlock Device A as scanner@Gate 1 on staging; cache primes from /guests/sync/.
2. Toggle Device A offline (airplane mode); scan Alice's QR; observe optimistic green
   card + "● offline — 1 queued" pill.
3. Device B (online, separate browser) scans Alice's QR; server marks Alice
   checked_in@Gate 2.
4. Toggle Device A online; queue drains; the row flips to conflict; header
   shows "⚠ 1 conflict".
5. Tap header pill → /scanner/escalations → "Send to help desk".
6. AuditEvent table shows: checkin.success (B), checkin.duplicate (A),
   checkin.conflict (A), checkin.help_desk_escalation (A).
7. PWA "Install" button works on Chrome desktop + Android Chrome.
8. SW boots the shell on cold reload with no network.
9. After 8 failed retries (backend hard-down), the row flips to failed and Sentry
   captures the exception (requires the env vars from "Deploy" above).
```

### Deviations from this plan

- **Worktree creation silently failed for Task 3.** The Agent tool's `isolation: "worktree"` did not create a worktree (no `<worktree>` block in the completion notification, no `worktree-agent-<id>` branch in `git branch -a`). The agent worked in the main checkout's CWD and committed directly to local `main` (`5a284f4`). Caught by the controller before pushing, spec-reviewed independently, and pushed only after verifying the diff was clean. Mitigation written into `~/.claude/projects/-Users-vinei-Projects-eventgate/memory/feedback_execution_workflow.md` — if a notification is missing the `<worktree>` block, treat the commit as having landed on local main.

- **Several agents experienced initial CWD confusion** because the early Plan E prompts embedded absolute paths (`/Users/vinei/Projects/eventgate/backend/...`). The agents followed those paths literally and edited the *main* checkout (which was simultaneously being touched by parallel-running agents), then reverted via `git checkout` and migrated their work to their worktree. No commit pollution survived, but the wasted effort prompted a workflow change: from Task 4 onward, all agent prompts use relative paths (`backend/...`, `frontend/...`) so the agent's CWD = worktree root applies cleanly. Recorded in memory.

- **`fly.toml` schema deviation (Task 0a).** The plan suggested `[processes.worker]` as a sub-block, which is invalid TOML when `[processes]` is already a key=value map (`worker = "celery …"` in the existing file). The agent used Fly's documented `[[restart]]` array-of-tables with `processes = ["worker"]` instead. `flyctl config validate` passed; live config on Fly shows `restart.policy = "always"` on the worker Machine.

- **`_hash_token` import was wrong in the plan** (Tasks 1, 2, 3). The actual helper is `hash_token` in `apps.common.tokens` — multiple test files already use that path (e.g., `tests/test_devices_models.py`). Each backend agent diagnosed and substituted independently.

- **`vi.useFakeTimers()` froze Dexie's transaction flush** (Task 9 mutation queue tests). The mock-everything default mode broke Dexie's microtask/timer machinery. Agent restricted to `vi.useFakeTimers({ toFake: ["Date"] })` so `vi.setSystemTime(NOW)` still anchors `Date.now()` (needed for the `next_attempt_at = NOW + 1000` backoff assertions) while leaving `setTimeout`/`queueMicrotask` real.

- **`new Response("", { status: 304 })` rejected by jsdom** (Task 8 refresh tests). 304 is a per-spec null-body status. Agent substituted a `Response`-shaped mock object cast to `Response` for the fetch spy, with a comment explaining the workaround.

- **`OrgScopedManager` shape change** (Task 0d mypy fixes). The class-based subclass `class OrgScopedManager(models.Manager.from_queryset(OrgScopedQuerySet)): pass` couldn't be annotated cleanly (mypy "Unsupported dynamic base class"). Replaced with a module-level assignment `OrgScopedManager = models.Manager.from_queryset(OrgScopedQuerySet)`. Behavior identical; no external `OrgScopedManager` references in the codebase.

- **`.prettierignore` added for `public/sw.js`** (Task 5). The minified esbuild output cannot pass `prettier --check`. The agent added a 2-line `.prettierignore` at `frontend/.prettierignore` ignoring only `public/sw.js` — scope tight, future-proof against the generated SW being re-checked.

- **Task 12 ran out of agent budget mid-execution** — implementer wrote the three files (`lib/scanner/escalations.ts`, `components/scanner/conflict-row.tsx`, `app/scanner/escalations/page.tsx`) but hit a `$0 usage limit` before reaching the commit step. Controller finished the commit inline: `pnpm format` to clean up prettier diffs, then `git add` + `git commit` with the exact spec subject (`cc74515`). No code changes needed beyond formatting.

- **Reviewer agents also briefly hit the `$0` budget cap.** From Task 13 onward, controller switched to inline diff review (Read + Bash `git diff`) instead of dispatching reviewer subagents. Spec compliance is unchanged; the discipline (verify diff scope, key behavior, commit hygiene) just happens in the controller's context.

- **Vercel auto-deploy was NOT broken; project `rootDirectory` was unset** (Task 0b finding). Every Plan D `git push` actually triggered a Vercel build — every build then failed with `NEXT_NO_VERSION` because Vercel ran `next build` against the monorepo root, which has no `package.json`. Manual `pnpm dlx vercel@latest --prod --yes` worked because it was invoked from inside `frontend/` and Vercel CLI uploads CWD as the deployment context, bypassing `rootDirectory`. Fixed via Vercel REST API: `PATCH /v9/projects/<id>` with `{"rootDirectory": "frontend"}`. Documented at `PLAN_E_TASK_0B_FINDINGS.md`. The user should verify by pushing an empty commit and watching for a `source=git` deployment to reach `state=READY`.

- **Sentry peer-warning sweep deferred to user-driven action.** `@sentry/nextjs@8.55.2` (the latest 8.x at install time) does not list Next 16 in its peer range — but neither does any newer major (`@sentry/nextjs@10.53.1`). Plan E ships with the `^8` pin; if Sentry publishes a Next-16-aware major later, Task F-or-H follow-up should upgrade. The browser SDK init in `sentry.client.config.ts` uses the v8 API (confirmed against `node_modules/@sentry/nextjs@8.55.2`).

- **Two `cast(timedelta, ...)` calls in `apps/accounts/views.py`** (Task 0d). `settings.SIMPLE_JWT[...]` is typed as `object` because Django settings dictionaries don't have field-level typing. The casts are runtime no-ops (the same as a `# type: ignore` was) but enforce a static check at the call site. A `TypedDict` for `SIMPLE_JWT` would be cleaner; out of scope for this task.

- **2 pre-existing mypy ignores opportunistically removed** in `apps/accounts/managers.py` (Task 0d) — once `BaseUserManager["User"]` was generic-parameterized, `user.set_password` / `user.set_unusable_password` typed correctly without the explicit ignores. 8 unrelated pre-existing ignores remain elsewhere (`apps/orgs/services.py`, `apps/common/permissions.py`, `apps/devices/auth.py`, `apps/guests/transitions.py`) — out of scope for Plan E.

### Follow-ups for Plan F (parking lot)

**Help-desk lane (Plan F headline):**

- Help-desk inbox UI — read from `AuditEvent` filtered by `action="checkin.help_desk_escalation"`. Allow staff to assign, resolve, override. Plan E's audit row carries `details_json.original_payload`, `details_json.conflict_payload`, `details_json.device_label`, plus the `entry_token` + `gate` + `scanner` on the row itself — enough for a first inbox.
- Audit-viewer UI in the organizer dashboard.
- Manual-review queue UI (`entry_status="manual_review"` rows).
- Dashboard polling counts (live "X checked in, Y queued, Z conflicts" on the event page).
- DB trigger: append-only on `audit_events` (`REVOKE UPDATE, DELETE` for the app role). Plan D + Plan E enforced append-only at the app layer only.

**Scanner UX gaps surfaced during Plan E:**

- Retry-failed-mutation affordance on `/scanner/escalations`. Today `failed` rows just sit there. Plan F should show them with a "Retry" button (resets `status=pending`, `attempts=0`, `next_attempt_at=now`).
- Reaper for orphaned `in_flight` mutations. If the page closes between `setting in_flight` and the fetch response, the row stays `in_flight` forever. A startup sweep that resets >5min-stale `in_flight` rows to `pending` would fix it.
- Optional: dedicated `HelpDeskTicket` table to replace audit-as-inbox, with a one-shot data migration from existing `checkin.help_desk_escalation` rows.

**Pre-pilot QA (Plan H or earlier):**

- Set `NEXT_PUBLIC_SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_ENV` on Vercel for production + preview.
- Khmer translation review for scanner + walk-in strings (machine-quality today).
- Resend sender-domain verification (still sandbox-only).
- Tighten Fly `ALLOWED_HOSTS` from `*` to a specific allowlist.
- Branded PWA icons in `public/icons/` (replaces favicon.ico placeholder).
- Pagination on `/guests/sync/` if any event approaches 50k guests (≤10k events today fit fine in one response).
- Investigate / remove the pre-existing `test_checkin_concurrency.py::test_only_one_concurrent_checkin_wins` flake — shared DB connection leakage between concurrent transactional tests.
