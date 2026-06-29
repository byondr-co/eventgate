# Dashboard Polish + SSE Live Data - Design

> **Program context:** Eventgate v2 uplift, slice #4 / slate Tier 3 #10.
> Slices #1 Wizard, #2 Core CRUD, and #3 list-scaling + export/bulk are merged.
> This slice upgrades the event dashboard from periodic polling to live
> operator data and adds gate analytics for event-day operations.

**Goal:** Replace the event dashboard's 5-10s happy-path polling with
server-pushed updates, and turn the event detail page into a compact live
command center: critical counts, throughput, peak window, gate utilization, and
recent operational activity.

## Decisions locked during brainstorming

1. **Live scope = shared event live channel**, not stats-only. The dashboard is
   the visible centerpiece, but live events also invalidate related helpdesk,
   audit, manual-review, and guest-count queries.
2. **Primary transport = SSE over ASGI**, not WebSocket and not smarter polling.
   WebSocket/Channels is unnecessary for one-way organizer updates; WSGI
   streaming is rejected because long-lived responses would occupy gunicorn
   workers.
3. **Deployment shape = convert the public backend app process to ASGI** via
   uvicorn. A separate Fly live process group was considered, but Fly process
   groups do not provide same-host path routing from `/api/.../live/` to one
   process and other `/api/*` traffic to another process.
4. **Push source = Redis publish from backend mutations.** Relevant mutation
   paths publish an event-changed hint after commit; the stream recomputes one
   backend-authoritative snapshot.
5. **SSE payload = fresh snapshot + invalidation hints.** The frontend should
   update the dashboard immediately, then invalidate related TanStack Query keys
   rather than deriving helpdesk/audit lists locally.
6. **Fallback = graceful polling.** If EventSource fails or repeatedly
   reconnects, the UI shows `Polling` and uses ETag-backed polling.
7. **Analytics priority = live operations.** First-class metrics are rolling
   throughput, active gate utilization, peak 5-minute window, and recent
   activity. Post-event reporting is not the main surface.
8. **Persist analytics now using minute buckets.** Add a small materialized
   counter table keyed by `(event, bucket_start, gate, scanner)` so live metrics
   are cheap and this slice leaves a modest reporting foundation.
9. **UI surface = existing event dashboard page.** No separate analytics tab in
   this slice.
10. **Layout emphasis = command center.** Critical live state first, analytics
    second, recent activity as context.
11. **Default windows = 5m throughput, 15m gate utilization, 60m trend.**
12. **Recent feed = recent ops activity**, not check-ins only.

## Current state (verified 2026-06-29)

- Backend deploy config `backend/fly.prod.toml` runs:
  `gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 ...`.
  `config/asgi.py` exists, and `uvicorn[standard]` is already in
  `backend/pyproject.toml`, but production does not use ASGI today.
- `backend/apps/events/views_stats.py` exposes
  `GET /api/v1/orgs/<org>/events/<event>/stats/` with seven count fields,
  `as_of`, and a 5s ETag/304 polling contract.
- `frontend/lib/event-stats.ts` polls `/stats/` every 5 seconds.
- Other pollers exist:
  - `frontend/lib/audit.ts` polls audit every 10 seconds.
  - `frontend/lib/helpdesk.ts` polls tickets/manual-review every 5 seconds and
    open-ticket count every 30 seconds.
  - `frontend/lib/guests.ts` polls guest count every 30 seconds.
- There is no existing `EventSource`, `text/event-stream`, Django Channels, or
  WebSocket implementation.
- Existing data is enough for a first analytics view:
  `Guest.checked_in_at`, `Guest.gate`, `Guest.scanner`, append-only
  `AuditEvent`, and `HelpDeskTicketState`.
- The frontend is a modified Next.js 16 app. `frontend/AGENTS.md` requires
  reading bundled docs before routing/hook work; relevant docs confirm browser
  APIs and custom hooks belong in Client Components.

## Architecture

### Transport

Add a new event-scoped live endpoint:

```text
GET /api/v1/orgs/<org>/events/<event>/live/
```

It returns `text/event-stream` and is served by Django under ASGI.

Production `backend/fly.prod.toml` changes the `app` process from WSGI gunicorn
to uvicorn, roughly:

```text
uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers 2
```

The worker and beat process groups stay unchanged.

The SSE endpoint should be an async Django view rather than a DRF `APIView`.
It can still reuse the existing cookie JWT and org-membership semantics through
a small shared auth/scope helper. The endpoint must return 401/403/404 with the
same leak-resistant behavior as `IsOrgMember`: non-members should not learn
whether an org exists.

SSE frame types:

```text
event: snapshot
id: <snapshot_etag_or_sequence>
data: { ...EventLiveSnapshot }

event: invalidate
data: {"keys":["stats","audit","helpdesk","manual_review","guests_count"],"reason":"checkin.success"}

event: heartbeat
data: {"as_of":"2026-06-29T...Z"}
```

The browser opens `EventSource` on the same-origin `/api/.../live/` path so the
existing httpOnly JWT cookie is sent through the Next/Vercel rewrite path. If
that proxy path proves unreliable for long-lived responses in verification, the
fallback polling behavior keeps the dashboard usable and the implementation
plan should record the finding before changing host/cookie architecture.

### Change publishing

Add a small live-publish helper, for example:

```python
publish_event_changed(
    event_id=event.id,
    reason="checkin.success",
    keys=("stats", "audit", "guests_count"),
)
```

It publishes JSON to a Redis channel scoped by event id. It must be called from
`transaction.on_commit(...)` for mutation paths so streams only react after the
database state is committed.

Initial publisher coverage:

- check-in success / duplicate / conflict
- scanner help-desk escalation
- helpdesk ticket claim / release / resolve
- manual-review resolution
- guest edit / void / delete / bulk actions
- public registration and walk-in claim/info completion where dashboard counts
  can change
- CSV import completion if guest count changes

Publish failures should be logged/Sentry-visible but should not fail the
primary mutation. The dashboard has polling fallback, and audit/guest state
remains authoritative.

### Materialized analytics

Add a new analytics app/table:

```text
EventGateMinuteMetric
```

Fields:

- `organization`
- `event`
- `bucket_start` - UTC minute floor
- `gate` - blank allowed for unknown
- `scanner` - blank allowed for unknown
- `checkins`
- `duplicates`
- `conflicts`
- `escalations`
- `created_at`
- `updated_at`

Constraints/indexes:

- unique `(event, bucket_start, gate, scanner)`
- index `(event, -bucket_start)`
- index `(event, gate, -bucket_start)`

Counters:

- `checkin.success` increments `checkins`
- `checkin.duplicate` increments `duplicates`
- `checkin.conflict` increments `conflicts`
- `checkin.help_desk_escalation` increments `escalations`

Metric updates are derived state. They should be best-effort after the primary
transaction commits; if an increment fails, the user-facing mutation still
succeeds. Because `AuditEvent` is append-only, a later rebuild command can
reconstruct metrics if needed. That rebuild command is out of scope for this
slice unless implementation discovers a cheap need for it in tests.

The increment service must handle concurrent first writes safely. The
implementation plan should require tests for duplicate/concurrent increments
against the unique bucket key.

### Snapshot service

Create one backend snapshot builder, roughly:

```python
build_event_live_snapshot(event) -> dict
```

It is consumed by:

- `GET .../stats/`
- the new SSE `snapshot` frames

The `/stats/` response remains backward-compatible: existing top-level fields
stay in place and new fields are additive.

Snapshot shape:

```json
{
  "checked_in": 120,
  "registered_not_arrived": 80,
  "manual_review": 2,
  "displayed": 1,
  "total_walkins": 25,
  "open_escalations": 3,
  "conflicts_recent_15min": 1,
  "analytics": {
    "throughput_5m": {
      "checkins": 18,
      "per_minute": 3.6,
      "window_start": "2026-06-29T12:20:00Z",
      "window_end": "2026-06-29T12:25:00Z"
    },
    "peak_5m": {
      "checkins": 42,
      "per_minute": 8.4,
      "window_start": "2026-06-29T11:40:00Z",
      "window_end": "2026-06-29T11:45:00Z"
    },
    "gate_utilization_15m": [
      {
        "gate": "North",
        "scanner": "A1",
        "checkins": 34,
        "share": 0.48,
        "per_minute": 2.27
      }
    ],
    "trend_60m": [
      {"bucket_start": "2026-06-29T11:25:00Z", "checkins": 4}
    ]
  },
  "recent_activity": [
    {
      "id": "uuid",
      "occurred_at": "2026-06-29T12:24:03Z",
      "action": "checkin.success",
      "result": "success",
      "gate": "North",
      "scanner": "A1",
      "guest_id": "uuid-or-null",
      "guest_label": "Sok Dara"
    }
  ],
  "as_of": "2026-06-29T12:25:10Z"
}
```

Recent activity includes the latest ~10 operational audit rows:

- `checkin.success`
- `checkin.duplicate`
- `checkin.conflict`
- `checkin.help_desk_escalation`
- `helpdesk.manual_review_escalated`
- `helpdesk.manual_review_resolved`
- `helpdesk.ticket_claimed`
- `helpdesk.ticket_resolved`

### Existing polling endpoints

Do not remove polling. Polling becomes fallback and background compatibility:

- `/stats/` still supports ETag/304.
- audit/helpdesk/manual-review/guest-count hooks keep their existing query
  functions.
- `useEventLive` invalidates those query keys when the stream reports a
  relevant change.

## Frontend

### Hook

Add:

```text
frontend/lib/event-live.ts
```

`useEventLive(orgSlug, eventSlug)`:

- opens an `EventSource` to `/api/v1/orgs/${orgSlug}/events/${eventSlug}/live/`
- stores latest `EventLiveSnapshot`
- exposes connection state:
  `connecting | live | reconnecting | polling`
- receives `snapshot` events and updates local snapshot state
- receives `invalidate` events and calls TanStack Query invalidations for:
  - `["event-stats", orgSlug, eventSlug]`
  - `["audit", orgSlug, eventSlug]`
  - `["helpdesk-tickets", orgSlug, eventSlug]`
  - `["helpdesk-manual-review", orgSlug, eventSlug]`
  - `["helpdesk-open-count", orgSlug, eventSlug]`
  - `["guests-count", orgSlug, eventSlug]`
- falls back to ETag polling after repeated stream failures

The hook may use React effects because EventSource is a browser subscription.
Implementation should avoid effect-driven derived state where event handlers or
TanStack Query can own the update directly.

### Command-center dashboard

Upgrade:

```text
frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx
frontend/components/events/stats-widget.tsx
```

Add focused dashboard components:

```text
frontend/components/events/live-status-badge.tsx
frontend/components/events/throughput-panel.tsx
frontend/components/events/gate-utilization-panel.tsx
frontend/components/events/peak-window-panel.tsx
frontend/components/events/recent-activity-panel.tsx
```

Layout:

1. Top area:
   - event title/status/venue stays
   - small connection badge: `Live`, `Reconnecting`, or `Polling`
   - six critical count tiles stay first:
     checked in, pending, walk-in QR shown, manual review, open escalations,
     conflicts
2. Middle area:
   - 5-minute throughput panel with compact 60-minute trend
   - ranked 15-minute gate/scanner utilization bars
   - quieter peak 5-minute window panel
3. Bottom area:
   - compact recent operational activity feed

Visual rules:

- operational, dense, and scan-friendly
- no hero treatment
- no nested cards
- cards only for distinct dashboard panels
- stable dimensions for trend/gate rows so live updates do not shift layout
- mobile stacks predictably; text must not overflow

## Error handling

- SSE heartbeat every ~25 seconds.
- Browser reconnection is allowed; UI shows `reconnecting` while the browser is
  attempting to recover.
- After repeated failures or unsupported `EventSource`, switch to `polling`.
- SSE stream does not mutate database state.
- Snapshot build errors emit a recoverable `error` frame if possible, then the
  client falls back to polling.
- Metric increment/publish failures are logged but do not block check-in,
  helpdesk, or guest mutations.
- Polling fallback uses the existing ETag cache to avoid waste when unchanged.

## Testing

### Backend

- `EventGateMinuteMetric` model constraints and indexes.
- Metric increment service:
  - creates the correct minute bucket
  - increments the right counter
  - preserves gate/scanner dimensions
  - handles repeated/concurrent increments for the same bucket
- Snapshot service:
  - preserves existing count fields
  - computes `throughput_5m`
  - computes `peak_5m`
  - computes `gate_utilization_15m`
  - computes `trend_60m`
  - serializes recent activity
- `/stats/` remains ETag/304-compatible and now includes additive analytics.
- SSE endpoint:
  - requires auth
  - enforces org membership without leaking org existence
  - returns `text/event-stream`
  - emits an initial snapshot
  - frames `snapshot`, `invalidate`, and `heartbeat` events correctly
- Mutation-path tests verify metric increments and live publish calls for
  check-in success/duplicate/conflict, helpdesk escalation/resolution, and guest
  status mutations.
- Deployment smoke in the plan: run backend locally under uvicorn and confirm
  `manage.py check` plus a live stream request succeed.

### Frontend

- `useEventLive` with mocked `EventSource`:
  - opens the expected URL
  - stores snapshot data
  - exposes connection state transitions
  - invalidates expected TanStack Query keys
  - falls back to polling after repeated errors
- Dashboard components render snapshot analytics and empty states.
- `StatsWidget` continues to render existing count fields.
- Command-center layout has no mobile/desktop text overflow in component tests
  and Playwright/manual verification where practical.

### Manual verification

Run the local Docker stack, start backend under uvicorn, and open the event
dashboard. Perform a scanner check-in and confirm:

- minute metric bucket increments
- dashboard updates without waiting for a 5s polling tick
- related audit/helpdesk query invalidations happen when relevant
- killing/restarting the stream moves UI to reconnecting/polling and recovers

## Sources checked for transport risk

- Fly process groups: https://fly.io/docs/launch/processes/
- Django `StreamingHttpResponse` behavior under WSGI vs ASGI:
  https://docs.djangoproject.com/en/5.1/ref/request-response/#streaminghttpresponse-objects

## Out of scope

- WebSockets, Django Channels, bidirectional browser commands, or scanner-device
  live command/control.
- Separate analytics route/page.
- Historical backfill/rebuild command for minute metrics.
- Full post-event reporting, exports, or warehouse-style fact/dimension schema.
- Named staff identity or gate/scanner registry modeling.
- Changing append-only audit semantics.
- Fixing the Fly billing/prod-offline blocker.
