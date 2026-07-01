# Dashboard SSE Live Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event dashboard's happy-path polling with an ASGI SSE live stream, add persisted minute-bucket gate analytics, and polish the existing event dashboard into a live command center.

**Architecture:** Add a small `apps.analytics` Django app for minute-bucket counters, a backend snapshot service shared by `/stats/` and the new `/live/` SSE endpoint, and Redis-backed event-change publishing from relevant mutation paths. The frontend gets a `useEventLive` hook that prefers `EventSource`, invalidates related TanStack Query keys, and falls back to existing ETag polling.

**Tech Stack:** Django + DRF + PostgreSQL + Redis + uvicorn/ASGI + pytest; Next.js 16 + React 19 + TanStack Query + Vitest/RTL.

---

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-27-dashboard-sse-design.md`.
- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`** trailer.
- **Branch:** continue on `topic/dashboard-sse-live-data`.
- **Backend tests:** use the compose DB. Command pattern:
  `cd backend && POSTGRES_PORT=5442 uv run pytest <tests> -q`.
- **Backend gates:** `uv run mypy apps config`, `uv run python manage.py makemigrations --check --dry-run`, `uv run python manage.py check`.
- **Frontend setup:** `cd frontend && export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20`.
- **Frontend gates:** `pnpm test -- <pattern>`, then full `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`.
- **Modified Next.js:** before frontend implementation tasks, re-read `frontend/AGENTS.md` and the bundled docs already identified as relevant:
  - `frontend/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `frontend/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
  - `frontend/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md`
- **No Channels/WebSockets.** Use native Django ASGI + `StreamingHttpResponse` with an async iterator.
- **Audit stays append-only.** Analytics metrics are derived state; never mutate audit rows.
- **Mutation failures:** metric increment and live publish failures are logged but must not block check-in/helpdesk/guest mutations.
- **Existing polling remains.** `/stats/` ETag/304 and existing audit/helpdesk/guest query hooks stay as fallback/compatibility.

## File Structure

### Backend

- Create `backend/apps/analytics/`
  - `apps.py` - app config.
  - `models.py` - `EventGateMinuteMetric`.
  - `services.py` - minute flooring, safe counter increment scheduling.
  - `migrations/0001_initial.py` - generated migration for metric table.
- Modify `backend/config/settings/base.py`
  - add `apps.analytics`.
- Create `backend/apps/events/live_snapshot.py`
  - `build_event_live_snapshot(event)` and `event_live_etag(event)`.
- Create `backend/apps/events/live_publish.py`
  - Redis channel naming, sync publish, and transaction-safe scheduling.
- Create `backend/apps/events/views_live.py`
  - auth/scope resolution, SSE frame formatting, async streaming view.
- Modify `backend/apps/events/views_stats.py`
  - delegate body/ETag to `live_snapshot`.
- Modify `backend/apps/events/urls.py`
  - add `/live/` route.
- Modify mutation paths:
  - `backend/apps/checkins/services.py`
  - `backend/apps/scanner/views.py`
  - `backend/apps/helpdesk/services.py`
  - `backend/apps/helpdesk/views_manual_review.py`
  - `backend/apps/guests/services.py`
  - `backend/apps/guests/views.py`
  - `backend/apps/guests/tasks.py`
  - `backend/apps/walkins/services.py`
- Modify deployment:
  - `backend/fly.prod.toml`
  - `backend/Dockerfile`

### Frontend

- Modify `frontend/lib/event-stats.ts`
  - add analytics/recent-activity types and optional polling controls.
- Create `frontend/lib/event-live.ts`
  - `useEventLive`.
- Create dashboard components:
  - `frontend/components/events/live-status-badge.tsx`
  - `frontend/components/events/throughput-panel.tsx`
  - `frontend/components/events/gate-utilization-panel.tsx`
  - `frontend/components/events/peak-window-panel.tsx`
  - `frontend/components/events/recent-activity-panel.tsx`
- Modify:
  - `frontend/components/events/stats-widget.tsx`
  - `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`

---

## Task 1: Analytics App + `EventGateMinuteMetric` Model

**Files:**
- Create: `backend/apps/analytics/__init__.py`
- Create: `backend/apps/analytics/apps.py`
- Create: `backend/apps/analytics/models.py`
- Modify: `backend/config/settings/base.py`
- Test: `backend/tests/test_analytics_metric_model.py`
- Generated: `backend/apps/analytics/migrations/0001_initial.py`

**Interfaces:**
- Produces `EventGateMinuteMetric` with unique `(event, bucket_start, gate, scanner)` and indexes for event-time and gate-time reads.

- [ ] **Step 1: Write the failing model test**

```python
# backend/tests/test_analytics_metric_model.py
from datetime import datetime, timezone as dt_timezone

import pytest
from django.db import IntegrityError

from apps.analytics.models import EventGateMinuteMetric
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Launch", slug="launch")


def test_metric_unique_key_is_event_bucket_gate_scanner(event):
    bucket = datetime(2026, 6, 29, 12, 30, tzinfo=dt_timezone.utc)
    EventGateMinuteMetric.objects.create(
        organization=event.organization,
        event=event,
        bucket_start=bucket,
        gate="North",
        scanner="A1",
        checkins=1,
    )

    with pytest.raises(IntegrityError):
        EventGateMinuteMetric.objects.create(
            organization=event.organization,
            event=event,
            bucket_start=bucket,
            gate="North",
            scanner="A1",
            checkins=1,
        )


def test_metric_defaults_counters_to_zero(event):
    bucket = datetime(2026, 6, 29, 12, 31, tzinfo=dt_timezone.utc)
    metric = EventGateMinuteMetric.objects.create(
        organization=event.organization,
        event=event,
        bucket_start=bucket,
        gate="",
        scanner="",
    )

    assert metric.checkins == 0
    assert metric.duplicates == 0
    assert metric.conflicts == 0
    assert metric.escalations == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_analytics_metric_model.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.analytics'`.

- [ ] **Step 3: Add the analytics app files**

```python
# backend/apps/analytics/apps.py
from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.analytics"
```

```python
# backend/apps/analytics/models.py
from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import OrgScopedModel


class EventGateMinuteMetric(OrgScopedModel):
    """Derived per-minute gate counters for live dashboard analytics."""

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="gate_metrics")
    bucket_start = models.DateTimeField()
    gate = models.CharField(max_length=64, blank=True, default="")
    scanner = models.CharField(max_length=64, blank=True, default="")
    checkins = models.PositiveIntegerField(default=0)
    duplicates = models.PositiveIntegerField(default=0)
    conflicts = models.PositiveIntegerField(default=0)
    escalations = models.PositiveIntegerField(default=0)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("event", "bucket_start", "gate", "scanner"),
                name="unique_gate_metric_bucket",
            )
        ]
        indexes: ClassVar = [
            models.Index(fields=("event", "-bucket_start"), name="metric_event_time_idx"),
            models.Index(fields=("event", "gate", "-bucket_start"), name="metric_gate_time_idx"),
        ]
        ordering = ("-bucket_start", "gate", "scanner")

    def save(self, *args, **kwargs):
        if not self.organization_id and self.event_id:
            self.organization = self.event.organization
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.event_id}:{self.bucket_start:%Y-%m-%d %H:%M} {self.gate}/{self.scanner}"
```

Create an empty `backend/apps/analytics/__init__.py`.

- [ ] **Step 4: Register the app**

In `backend/config/settings/base.py`, add `"apps.analytics",` after `"apps.audit",`.

- [ ] **Step 5: Generate migration**

Run: `cd backend && uv run python manage.py makemigrations analytics`

Expected: creates `backend/apps/analytics/migrations/0001_initial.py`.

- [ ] **Step 6: Run model tests and migration check**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_analytics_metric_model.py -q && uv run python manage.py makemigrations --check --dry-run`

Expected: PASS and `No changes detected`.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/analytics backend/config/settings/base.py backend/tests/test_analytics_metric_model.py
git commit -m "feat(analytics): add event gate minute metric model"
```

---

## Task 2: Metric Increment Service

**Files:**
- Create: `backend/apps/analytics/services.py`
- Test: `backend/tests/test_analytics_metric_service.py`

**Interfaces:**
- Produces:
  - `minute_floor(dt)`
  - `increment_event_metric(...)`
  - `schedule_metric_increment(...)`
- Counter names: `"checkins" | "duplicates" | "conflicts" | "escalations"`.

- [ ] **Step 1: Write the failing service tests**

```python
# backend/tests/test_analytics_metric_service.py
from datetime import datetime, timezone as dt_timezone

import pytest
from django.db import transaction

from apps.analytics.models import EventGateMinuteMetric
from apps.analytics.services import increment_event_metric, minute_floor, schedule_metric_increment
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Launch", slug="launch")


def test_minute_floor_removes_seconds_and_microseconds():
    dt = datetime(2026, 6, 29, 12, 30, 45, 123, tzinfo=dt_timezone.utc)
    assert minute_floor(dt) == datetime(2026, 6, 29, 12, 30, tzinfo=dt_timezone.utc)


def test_increment_event_metric_creates_and_increments_same_bucket(event):
    at = datetime(2026, 6, 29, 12, 30, 45, tzinfo=dt_timezone.utc)
    increment_event_metric(
        organization_id=event.organization_id,
        event_id=event.id,
        counter="checkins",
        occurred_at=at,
        gate="North",
        scanner="A1",
    )
    increment_event_metric(
        organization_id=event.organization_id,
        event_id=event.id,
        counter="checkins",
        occurred_at=at,
        gate="North",
        scanner="A1",
    )

    metric = EventGateMinuteMetric.objects.get(event=event, gate="North", scanner="A1")
    assert metric.bucket_start == datetime(2026, 6, 29, 12, 30, tzinfo=dt_timezone.utc)
    assert metric.checkins == 2


def test_increment_event_metric_rejects_unknown_counter(event):
    with pytest.raises(ValueError, match="Unknown metric counter"):
        increment_event_metric(
            organization_id=event.organization_id,
            event_id=event.id,
            counter="bad",
        )


@pytest.mark.django_db(transaction=True)
def test_schedule_metric_increment_runs_after_commit(event):
    with transaction.atomic():
        schedule_metric_increment(
            organization_id=event.organization_id,
            event_id=event.id,
            counter="duplicates",
            occurred_at=datetime(2026, 6, 29, 12, 31, tzinfo=dt_timezone.utc),
            gate="South",
            scanner="B1",
        )
        assert EventGateMinuteMetric.objects.count() == 0

    metric = EventGateMinuteMetric.objects.get(event=event, gate="South", scanner="B1")
    assert metric.duplicates == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_analytics_metric_service.py -q`

Expected: FAIL with `ModuleNotFoundError` or import error for `apps.analytics.services`.

- [ ] **Step 3: Implement the service**

```python
# backend/apps/analytics/services.py
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone
from typing import Literal

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.analytics.models import EventGateMinuteMetric

MetricCounter = Literal["checkins", "duplicates", "conflicts", "escalations"]
_COUNTERS = {"checkins", "duplicates", "conflicts", "escalations"}

logger = logging.getLogger(__name__)


def minute_floor(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc).replace(second=0, microsecond=0)


def increment_event_metric(
    *,
    organization_id,
    event_id,
    counter: MetricCounter | str,
    occurred_at: datetime | None = None,
    gate: str = "",
    scanner: str = "",
) -> None:
    if counter not in _COUNTERS:
        raise ValueError(f"Unknown metric counter: {counter}")

    bucket_start = minute_floor(occurred_at or timezone.now())
    clean_gate = (gate or "")[:64]
    clean_scanner = (scanner or "")[:64]

    for attempt in range(2):
        try:
            with transaction.atomic():
                metric, _ = EventGateMinuteMetric.objects.get_or_create(
                    organization_id=organization_id,
                    event_id=event_id,
                    bucket_start=bucket_start,
                    gate=clean_gate,
                    scanner=clean_scanner,
                )
                EventGateMinuteMetric.objects.filter(pk=metric.pk).update(
                    **{counter: F(counter) + 1}
                )
            return
        except IntegrityError:
            if attempt == 1:
                raise


def schedule_metric_increment(
    *,
    organization_id,
    event_id,
    counter: MetricCounter,
    occurred_at: datetime | None = None,
    gate: str = "",
    scanner: str = "",
) -> None:
    metric_at = occurred_at or timezone.now()

    def _increment() -> None:
        try:
            increment_event_metric(
                organization_id=organization_id,
                event_id=event_id,
                counter=counter,
                occurred_at=metric_at,
                gate=gate,
                scanner=scanner,
            )
        except Exception:
            logger.exception(
                "Failed to increment event live metric",
                extra={"event_id": str(event_id), "counter": counter},
            )

    transaction.on_commit(_increment)
```

- [ ] **Step 4: Run service tests + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_analytics_metric_service.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/analytics/services.py backend/tests/test_analytics_metric_service.py
git commit -m "feat(analytics): increment event gate minute metrics"
```

---

## Task 3: Live Snapshot Service + `/stats/` Refactor

**Files:**
- Create: `backend/apps/events/live_snapshot.py`
- Modify: `backend/apps/events/views_stats.py`
- Test: `backend/tests/test_event_live_snapshot.py`
- Modify: `backend/tests/test_event_stats_endpoint.py`

**Interfaces:**
- Produces `build_event_live_snapshot(event) -> dict`.
- Produces `event_live_etag(event) -> str`.
- `/stats/` remains backward-compatible and gains additive `analytics` + `recent_activity`.

- [ ] **Step 1: Write failing snapshot tests**

```python
# backend/tests/test_event_live_snapshot.py
from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from django.utils import timezone

from apps.analytics.models import EventGateMinuteMetric
from apps.audit.services import write_audit
from apps.events.live_snapshot import build_event_live_snapshot
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Launch", slug="launch")


def test_snapshot_preserves_existing_count_fields(event):
    Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token="a",
        entry_status="checked_in",
    )
    Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token="b",
        entry_status="registered_not_arrived",
    )

    body = build_event_live_snapshot(event)

    assert body["checked_in"] == 1
    assert body["registered_not_arrived"] == 1
    assert body["manual_review"] == 0
    assert body["displayed"] == 0
    assert "analytics" in body
    assert "recent_activity" in body


def test_snapshot_computes_throughput_peak_utilization_and_trend(event):
    now = timezone.now().astimezone(dt_timezone.utc).replace(second=0, microsecond=0)
    for offset, count in [(0, 3), (1, 4), (2, 5), (20, 9)]:
        EventGateMinuteMetric.objects.create(
            organization=event.organization,
            event=event,
            bucket_start=now - timedelta(minutes=offset),
            gate="North" if offset != 1 else "South",
            scanner="A1",
            checkins=count,
        )

    body = build_event_live_snapshot(event, now=now)
    analytics = body["analytics"]

    assert analytics["throughput_5m"]["checkins"] == 12
    assert analytics["throughput_5m"]["per_minute"] == 2.4
    assert analytics["peak_5m"]["checkins"] >= 12
    assert analytics["gate_utilization_15m"][0]["checkins"] >= 5
    assert len(analytics["trend_60m"]) == 60


def test_snapshot_recent_activity_uses_operational_audit_rows(event):
    guest = Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token="a",
        full_name="Ana",
    )
    audit = write_audit(
        organization=event.organization,
        event=event,
        guest=guest,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.success",
        result="success",
        gate="North",
        scanner="A1",
    )

    body = build_event_live_snapshot(event)

    assert body["recent_activity"][0]["id"] == str(audit.id)
    assert body["recent_activity"][0]["guest_label"] == "Ana"
```

- [ ] **Step 2: Run snapshot tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_snapshot.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.events.live_snapshot'`.

- [ ] **Step 3: Implement snapshot service**

```python
# backend/apps/events/live_snapshot.py
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any

from django.db.models import Count, Max, Sum
from django.utils import timezone

from apps.analytics.models import EventGateMinuteMetric
from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState

RECENT_ACTIVITY_ACTIONS = (
    "checkin.success",
    "checkin.duplicate",
    "checkin.conflict",
    "checkin.help_desk_escalation",
    "helpdesk.manual_review_escalated",
    "helpdesk.manual_review_resolved",
    "helpdesk.ticket_claimed",
    "helpdesk.ticket_resolved",
)


def _minute_floor(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc).replace(second=0, microsecond=0)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(dt_timezone.utc).isoformat().replace("+00:00", "Z")


def _metric_rows(event: Event, *, since: datetime | None = None):
    qs = EventGateMinuteMetric.objects.filter(event=event)
    if since is not None:
        qs = qs.filter(bucket_start__gte=since)
    return qs


def _throughput(event: Event, *, now_floor: datetime) -> dict[str, Any]:
    start = now_floor - timedelta(minutes=4)
    total = (
        _metric_rows(event, since=start).aggregate(total=Sum("checkins")).get("total") or 0
    )
    return {
        "checkins": total,
        "per_minute": round(total / 5, 2),
        "window_start": _iso(start),
        "window_end": _iso(now_floor + timedelta(minutes=1)),
    }


def _peak(event: Event) -> dict[str, Any]:
    rows = (
        EventGateMinuteMetric.objects.filter(event=event)
        .values("bucket_start")
        .annotate(checkins=Sum("checkins"))
        .order_by("bucket_start")
    )
    bucket_counts = {row["bucket_start"]: row["checkins"] or 0 for row in rows}
    if not bucket_counts:
        return {"checkins": 0, "per_minute": 0.0, "window_start": None, "window_end": None}

    best_start = min(bucket_counts)
    best_total = 0
    for start in bucket_counts:
        end = start + timedelta(minutes=5)
        total = sum(count for bucket, count in bucket_counts.items() if start <= bucket < end)
        if total > best_total:
            best_total = total
            best_start = start
    return {
        "checkins": best_total,
        "per_minute": round(best_total / 5, 2),
        "window_start": _iso(best_start),
        "window_end": _iso(best_start + timedelta(minutes=5)),
    }


def _gate_utilization(event: Event, *, now_floor: datetime) -> list[dict[str, Any]]:
    start = now_floor - timedelta(minutes=14)
    rows = (
        _metric_rows(event, since=start)
        .values("gate", "scanner")
        .annotate(checkins=Sum("checkins"), duplicates=Sum("duplicates"), conflicts=Sum("conflicts"))
        .order_by("-checkins", "gate", "scanner")
    )
    total = sum(row["checkins"] or 0 for row in rows)
    out = []
    for row in rows:
        checkins = row["checkins"] or 0
        out.append(
            {
                "gate": row["gate"] or "Unknown",
                "scanner": row["scanner"] or "",
                "checkins": checkins,
                "duplicates": row["duplicates"] or 0,
                "conflicts": row["conflicts"] or 0,
                "share": round(checkins / total, 4) if total else 0,
                "per_minute": round(checkins / 15, 2),
            }
        )
    return out


def _trend(event: Event, *, now_floor: datetime) -> list[dict[str, Any]]:
    start = now_floor - timedelta(minutes=59)
    rows = (
        _metric_rows(event, since=start)
        .values("bucket_start")
        .annotate(checkins=Sum("checkins"))
    )
    by_bucket = {row["bucket_start"]: row["checkins"] or 0 for row in rows}
    return [
        {
            "bucket_start": _iso(start + timedelta(minutes=i)),
            "checkins": by_bucket.get(start + timedelta(minutes=i), 0),
        }
        for i in range(60)
    ]


def _recent_activity(event: Event) -> list[dict[str, Any]]:
    rows = (
        AuditEvent.objects.filter(event=event, action__in=RECENT_ACTIVITY_ACTIONS)
        .select_related("guest")
        .order_by("-occurred_at")[:10]
    )
    out = []
    for row in rows:
        guest = row.guest
        out.append(
            {
                "id": str(row.id),
                "occurred_at": _iso(row.occurred_at),
                "action": row.action,
                "result": row.result,
                "gate": row.gate,
                "scanner": row.scanner,
                "guest_id": str(guest.id) if guest else None,
                "guest_label": (
                    guest.full_name or guest.email or guest.entry_token[:8] if guest else ""
                ),
            }
        )
    return out


def build_event_live_snapshot(event: Event, *, now: datetime | None = None) -> dict[str, Any]:
    now_dt = now or timezone.now()
    now_floor = _minute_floor(now_dt)

    status_counts = (
        Guest.objects.filter(event=event).values("entry_status").annotate(n=Count("id"))
    )
    bucket = {row["entry_status"]: row["n"] for row in status_counts}
    total_walkins = Guest.objects.filter(event=event, guest_type="walk_in").count()
    open_escalations = HelpDeskTicketState.objects.filter(
        event=event, claim_status__in=("open", "claimed")
    ).count()
    cutoff = now_dt - timedelta(minutes=15)
    conflicts_recent = AuditEvent.objects.filter(
        event=event, action="checkin.conflict", occurred_at__gte=cutoff
    ).count()

    return {
        "checked_in": bucket.get("checked_in", 0),
        "registered_not_arrived": bucket.get("registered_not_arrived", 0),
        "manual_review": bucket.get("manual_review", 0),
        "displayed": bucket.get("displayed", 0),
        "total_walkins": total_walkins,
        "open_escalations": open_escalations,
        "conflicts_recent_15min": conflicts_recent,
        "analytics": {
            "throughput_5m": _throughput(event, now_floor=now_floor),
            "peak_5m": _peak(event),
            "gate_utilization_15m": _gate_utilization(event, now_floor=now_floor),
            "trend_60m": _trend(event, now_floor=now_floor),
        },
        "recent_activity": _recent_activity(event),
        "as_of": _iso(now_dt),
    }


def event_live_etag(event: Event) -> str:
    guest_agg = Guest.objects.filter(event=event).aggregate(latest=Max("updated_at"), n=Count("id"))
    ticket_agg = HelpDeskTicketState.objects.filter(event=event).aggregate(
        latest=Max("updated_at"), n=Count("id")
    )
    audit_agg = AuditEvent.objects.filter(event=event).aggregate(
        latest=Max("occurred_at"), n=Count("id")
    )
    metric_agg = EventGateMinuteMetric.objects.filter(event=event).aggregate(
        latest=Max("updated_at"), n=Count("id")
    )
    raw = (
        f"{guest_agg['latest']}-{guest_agg['n']}-"
        f"{ticket_agg['latest']}-{ticket_agg['n']}-"
        f"{audit_agg['latest']}-{audit_agg['n']}-"
        f"{metric_agg['latest']}-{metric_agg['n']}"
    )
    return f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
```

- [ ] **Step 4: Refactor `/stats/` to use the snapshot**

Replace `backend/apps/events/views_stats.py` with:

```python
"""GET /api/v1/orgs/<slug>/events/<event>/stats/ — live dashboard snapshot.

ETag/304 remains for polling fallback. The body keeps the original top-level
count fields and adds analytics/recent_activity.
"""

from __future__ import annotations

from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.live_snapshot import build_event_live_snapshot, event_live_etag
from apps.events.models import Event


class EventStatsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        etag = event_live_etag(event)
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        resp = Response(build_event_live_snapshot(event))
        resp["ETag"] = etag
        return resp
```

- [ ] **Step 5: Extend stats endpoint tests**

Append to `backend/tests/test_event_stats_endpoint.py`:

```python
def test_stats_includes_additive_live_analytics(env):
    c, org, event = env
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    body = r.json()
    assert "analytics" in body
    assert "throughput_5m" in body["analytics"]
    assert "gate_utilization_15m" in body["analytics"]
    assert "recent_activity" in body
```

- [ ] **Step 6: Run tests + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_snapshot.py tests/test_event_stats_endpoint.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/events/live_snapshot.py backend/apps/events/views_stats.py backend/tests/test_event_live_snapshot.py backend/tests/test_event_stats_endpoint.py
git commit -m "feat(events): build live dashboard snapshot for stats"
```

---

## Task 4: Redis Live Publish Helper

**Files:**
- Create: `backend/apps/events/live_publish.py`
- Test: `backend/tests/test_event_live_publish.py`

**Interfaces:**
- Produces:
  - `event_live_channel(event_id)`
  - `publish_event_changed(event_id, reason, keys)`
  - `schedule_event_changed(event_id, reason, keys)`
  - `safe_publish_event_changed(...)`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_event_live_publish.py
import json

import pytest
from django.db import transaction

from apps.events.live_publish import event_live_channel, publish_event_changed, schedule_event_changed


def test_event_live_channel_scopes_by_event_id():
    assert event_live_channel("evt-1") == "eventgate:event:evt-1:live"


def test_publish_event_changed_publishes_json(monkeypatch, settings):
    calls = []

    class FakeRedis:
        def publish(self, channel, payload):
            calls.append((channel, json.loads(payload)))
            return 1

    class FakeRedisFactory:
        @staticmethod
        def from_url(url, decode_responses):
            assert url == settings.REDIS_URL
            assert decode_responses is True
            return FakeRedis()

    monkeypatch.setattr("apps.events.live_publish.redis.Redis", FakeRedisFactory)

    publish_event_changed(event_id="evt-1", reason="checkin.success", keys=("stats", "audit"))

    assert calls == [
        (
            "eventgate:event:evt-1:live",
            {"event_id": "evt-1", "reason": "checkin.success", "keys": ["stats", "audit"]},
        )
    ]


@pytest.mark.django_db(transaction=True)
def test_schedule_event_changed_runs_after_commit(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "apps.events.live_publish.safe_publish_event_changed",
        lambda **kwargs: calls.append(kwargs),
    )

    with transaction.atomic():
        schedule_event_changed(event_id="evt-2", reason="guest.updated", keys=("stats",))
        assert calls == []

    assert calls == [{"event_id": "evt-2", "reason": "guest.updated", "keys": ("stats",)}]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_publish.py -q`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement live publish helper**

```python
# backend/apps/events/live_publish.py
from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from typing import Any

import redis
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


def event_live_channel(event_id: Any) -> str:
    return f"eventgate:event:{event_id}:live"


def publish_event_changed(*, event_id: Any, reason: str, keys: Iterable[str]) -> None:
    payload = {
        "event_id": str(event_id),
        "reason": reason,
        "keys": list(keys),
    }
    client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    client.publish(event_live_channel(event_id), json.dumps(payload, separators=(",", ":")))


def safe_publish_event_changed(*, event_id: Any, reason: str, keys: Iterable[str]) -> None:
    try:
        publish_event_changed(event_id=event_id, reason=reason, keys=keys)
    except Exception:
        logger.exception(
            "Failed to publish event live change",
            extra={"event_id": str(event_id), "reason": reason},
        )


def schedule_event_changed(*, event_id: Any, reason: str, keys: tuple[str, ...]) -> None:
    transaction.on_commit(
        lambda: safe_publish_event_changed(event_id=event_id, reason=reason, keys=keys)
    )
```

- [ ] **Step 4: Run tests + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_publish.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/events/live_publish.py backend/tests/test_event_live_publish.py
git commit -m "feat(events): publish live dashboard change hints"
```

---

## Task 5: SSE Live Endpoint

**Files:**
- Create: `backend/apps/events/views_live.py`
- Modify: `backend/apps/events/urls.py`
- Test: `backend/tests/test_event_live_endpoint.py`

**Interfaces:**
- Produces `GET /api/v1/orgs/<org>/events/<event>/live/`.
- Emits `snapshot`, `invalidate`, and `heartbeat` SSE frames.

- [ ] **Step 1: Write failing endpoint tests**

```python
import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.views_live import format_sse
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env():
    user = User.objects.create_user(email="owner@example.com", password="x")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    return user, org, event


def live_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/live/"


def auth_client(user):
    c = APIClient()
    c.cookies[settings.JWT_ACCESS_COOKIE] = str(AccessToken.for_user(user))
    return c


def test_format_sse_frames_json_data():
    frame = format_sse("snapshot", {"checked_in": 1}, event_id="abc")
    assert frame.startswith("id: abc\nevent: snapshot\n")
    assert 'data: {"checked_in":1}' in frame
    assert frame.endswith("\n\n")


def test_live_endpoint_requires_auth(env):
    _, org, event = env
    r = APIClient().get(live_url(org, event))
    assert r.status_code in (401, 403)


def test_live_endpoint_returns_event_stream(env):
    user, org, event = env
    r = auth_client(user).get(live_url(org, event))
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/event-stream")
    assert r["Cache-Control"] == "no-cache"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_endpoint.py -q`

Expected: FAIL with missing `apps.events.views_live`.

- [ ] **Step 3: Implement the SSE view**

```python
# backend/apps/events/views_live.py
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis_async
from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import Http404, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from apps.accounts.authentication import CookieJWTAuthentication
from apps.events.live_publish import event_live_channel
from apps.events.live_snapshot import build_event_live_snapshot, event_live_etag
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


def format_sse(event: str, data: dict[str, Any], *, event_id: str | None = None) -> str:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, separators=(",", ":"), default=str)
    for line in payload.splitlines() or [""]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def _resolve_live_event(request, *, org_slug: str, event_slug: str) -> Event:
    auth = CookieJWTAuthentication().authenticate(Request(request))
    if auth is None:
        raise AuthenticationFailed("Authentication credentials were not provided.")
    user, _token = auth

    org = get_object_or_404(Organization, slug=org_slug)
    if not OrganizationMembership.objects.filter(
        organization=org, user=user, is_active=True
    ).exists():
        raise Http404
    return get_object_or_404(Event, organization=org, slug=event_slug)


def _snapshot_for_event_id(event_id) -> tuple[dict[str, Any], str]:
    event = Event.objects.get(id=event_id)
    return build_event_live_snapshot(event), event_live_etag(event)


async def _stream_event(event_id) -> Any:
    snapshot, etag = await sync_to_async(_snapshot_for_event_id)(event_id)
    yield format_sse("snapshot", snapshot, event_id=etag)

    client = redis_async.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = client.pubsub()
    channel = event_live_channel(event_id)
    await pubsub.subscribe(channel)
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=25.0)
            if msg is None:
                yield format_sse("heartbeat", {"as_of": timezone.now().isoformat()})
                continue
            try:
                payload = json.loads(msg.get("data") or "{}")
            except json.JSONDecodeError:
                payload = {"event_id": str(event_id), "reason": "unknown", "keys": ["stats"]}
            yield format_sse("invalidate", payload)
            snapshot, etag = await sync_to_async(_snapshot_for_event_id)(event_id)
            yield format_sse("snapshot", snapshot, event_id=etag)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await client.aclose()


async def EventLiveView(request, org_slug: str, event_slug: str):
    try:
        event = await sync_to_async(_resolve_live_event)(
            request, org_slug=org_slug, event_slug=event_slug
        )
    except AuthenticationFailed as exc:
        return JsonResponse({"detail": str(exc)}, status=401)

    response = StreamingHttpResponse(_stream_event(event.id), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
```

- [ ] **Step 4: Add the route**

Modify `backend/apps/events/urls.py`:

```python
from apps.events.views_live import EventLiveView
```

Add after the stats route:

```python
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/live/",
        EventLiveView,
        name="event-live",
    ),
```

- [ ] **Step 5: Run endpoint tests + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_event_live_endpoint.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/events/views_live.py backend/apps/events/urls.py backend/tests/test_event_live_endpoint.py
git commit -m "feat(events): add SSE live dashboard endpoint"
```

---

## Task 6: Wire Check-in, Escalation, and Helpdesk Live Signals

**Files:**
- Modify: `backend/apps/checkins/services.py`
- Modify: `backend/apps/scanner/views.py`
- Modify: `backend/apps/helpdesk/services.py`
- Modify: `backend/apps/helpdesk/views_manual_review.py`
- Test: `backend/tests/test_live_signal_mutations.py`

**Interfaces:**
- Hot event-day mutation paths increment metrics and schedule live publishes.

- [ ] **Step 1: Write failing tests with monkeypatched schedulers**

```python
import pytest

from apps.audit.services import write_audit
from apps.checkins.services import CheckinFailure, perform_checkin
from apps.devices.models import ScannerDevice
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState
from apps.helpdesk.services import claim_ticket
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = django_user_model.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate Device",
        role="scanner",
        device_token_hash="hash",
    )
    return org, user, event, device


def test_checkin_success_schedules_metric_and_live_publish(monkeypatch, env):
    org, _, event, device = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok",
        entry_status="registered_not_arrived",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr("apps.checkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw))
    monkeypatch.setattr("apps.checkins.services.schedule_event_changed", lambda **kw: publishes.append(kw))

    perform_checkin(
        device=device,
        token=guest.entry_token,
        gate="North",
        scanner_label="A1",
        client_idempotency_key="idem-1",
    )

    assert metrics[0]["counter"] == "checkins"
    assert metrics[0]["gate"] == "North"
    assert publishes[0]["reason"] == "checkin.success"
    assert "stats" in publishes[0]["keys"]


def test_checkin_duplicate_schedules_duplicate_metric(monkeypatch, env):
    org, _, event, device = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok",
        entry_status="checked_in",
        gate="North",
        scanner="A1",
    )
    metrics = []
    monkeypatch.setattr("apps.checkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw))
    monkeypatch.setattr("apps.checkins.services.schedule_event_changed", lambda **kw: None)

    with pytest.raises(CheckinFailure):
        perform_checkin(
            device=device,
            token=guest.entry_token,
            gate="North",
            scanner_label="A1",
            client_idempotency_key="idem-2",
        )

    assert metrics[0]["counter"] == "duplicates"


def test_helpdesk_claim_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        organization=org, event=event, audit_event=audit, claim_status="open"
    )
    publishes = []
    monkeypatch.setattr("apps.helpdesk.services.schedule_event_changed", lambda **kw: publishes.append(kw))

    claim_ticket(ticket=ticket, user=user)

    assert publishes[0]["reason"] == "helpdesk.ticket_claimed"
    assert "helpdesk" in publishes[0]["keys"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_live_signal_mutations.py -q`

Expected: FAIL because mutation modules do not import the schedulers.

- [ ] **Step 3: Wire check-in service**

In `backend/apps/checkins/services.py`, add imports:

```python
from apps.analytics.services import schedule_metric_increment
from apps.events.live_publish import schedule_event_changed
```

After the `checkin.success` audit write in the success path, add:

```python
            schedule_metric_increment(
                organization_id=device.organization_id,
                event_id=device.event_id,
                counter="checkins",
                gate=gate,
                scanner=scanner_label,
            )
            schedule_event_changed(
                event_id=device.event_id,
                reason="checkin.success",
                keys=("stats", "audit", "guests_count"),
            )
```

In the duplicate block, before raising `CheckinFailure`, add:

```python
        schedule_metric_increment(
            organization_id=device.organization_id,
            event_id=device.event_id,
            counter="duplicates",
            gate=gate,
            scanner=scanner_label,
        )
        schedule_event_changed(
            event_id=device.event_id,
            reason="checkin.duplicate",
            keys=("stats", "audit", "helpdesk"),
        )
```

Inside the conflict branch, after the `checkin.conflict` audit write, add:

```python
            schedule_metric_increment(
                organization_id=device.organization_id,
                event_id=device.event_id,
                counter="conflicts",
                gate=gate,
                scanner=scanner_label,
            )
            schedule_event_changed(
                event_id=device.event_id,
                reason="checkin.conflict",
                keys=("stats", "audit", "helpdesk"),
            )
```

- [ ] **Step 4: Wire scanner escalation**

In `backend/apps/scanner/views.py`, add imports:

```python
from apps.analytics.services import schedule_metric_increment
from apps.events.live_publish import schedule_event_changed
```

After `HelpDeskTicketState.objects.create(...)`, before returning:

```python
            schedule_metric_increment(
                organization_id=device.organization_id,
                event_id=device.event_id,
                counter="escalations",
                gate="",
                scanner=device.label,
            )
            schedule_event_changed(
                event_id=device.event_id,
                reason="checkin.help_desk_escalation",
                keys=("stats", "audit", "helpdesk"),
            )
```

- [ ] **Step 5: Wire helpdesk services**

In `backend/apps/helpdesk/services.py`, add:

```python
from apps.events.live_publish import schedule_event_changed
```

After each audit write:

```python
    schedule_event_changed(
        event_id=ticket.event_id,
        reason="helpdesk.ticket_claimed",
        keys=("stats", "audit", "helpdesk"),
    )
```

For release:

```python
    schedule_event_changed(
        event_id=ticket.event_id,
        reason="helpdesk.ticket_released",
        keys=("stats", "audit", "helpdesk"),
    )
```

For resolve:

```python
    schedule_event_changed(
        event_id=ticket.event_id,
        reason="helpdesk.ticket_resolved",
        keys=("stats", "audit", "helpdesk", "manual_review"),
    )
```

Inside `_escalate_guest_to_manual_review`, after `helpdesk.manual_review_escalated` audit:

```python
    schedule_event_changed(
        event_id=ticket.event_id,
        reason="helpdesk.manual_review_escalated",
        keys=("stats", "audit", "helpdesk", "manual_review", "guests_count"),
    )
```

- [ ] **Step 6: Wire manual review resolve view**

In `backend/apps/helpdesk/views_manual_review.py`, add:

```python
from apps.events.live_publish import schedule_event_changed
```

After the `helpdesk.manual_review_resolved` audit:

```python
        schedule_event_changed(
            event_id=event.id,
            reason="helpdesk.manual_review_resolved",
            keys=("stats", "audit", "helpdesk", "manual_review", "guests_count"),
        )
```

- [ ] **Step 7: Run focused mutation tests + affected suites**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_live_signal_mutations.py tests/test_checkin_idempotent.py tests/test_checkin_conflict_audit.py tests/test_scanner_escalation_endpoint.py tests/test_helpdesk_actions.py tests/test_helpdesk_manual_review.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/checkins/services.py backend/apps/scanner/views.py backend/apps/helpdesk/services.py backend/apps/helpdesk/views_manual_review.py backend/tests/test_live_signal_mutations.py
git commit -m "feat(events): publish live updates from checkin and helpdesk paths"
```

---

## Task 7: Wire Guest, Registration, Walk-in, and CSV Live Signals

**Files:**
- Modify: `backend/apps/guests/services.py`
- Modify: `backend/apps/guests/views.py`
- Modify: `backend/apps/guests/tasks.py`
- Modify: `backend/apps/walkins/services.py`
- Test: `backend/tests/test_live_signal_guest_paths.py`

**Interfaces:**
- Non-checkin dashboard-changing mutations schedule live invalidations.
- Walk-in claim increments the `checkins` metric because it transitions a guest into `checked_in`.

- [ ] **Step 1: Write failing guest-path tests**

```python
import pytest

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.guests.models import Guest
from apps.guests.services import register_guest
from apps.orgs.models import Organization, OrganizationMembership
from apps.walkins.services import claim_walkin

pytestmark = pytest.mark.django_db


@pytest.fixture
def env():
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    RegistrationField.objects.create(event=event, field_key="email", label_en="Email", required=True)
    return org, user, event


def test_register_guest_schedules_live_publish(monkeypatch, env):
    _, _, event = env
    publishes = []
    monkeypatch.setattr("apps.guests.services.schedule_event_changed", lambda **kw: publishes.append(kw))
    monkeypatch.setattr("apps.guests.tasks.send_qr_email_task.delay", lambda **kw: None)

    register_guest(event=event, payload={"email": "a@example.com"})

    assert publishes[0]["reason"] == "guest.registered"
    assert "guests_count" in publishes[0]["keys"]


def test_walkin_claim_schedules_checkin_metric_and_live_publish(monkeypatch, env):
    org, _, event = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="displayed",
        gate="North",
        scanner="WalkinTablet",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr("apps.walkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw))
    monkeypatch.setattr("apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw))

    claim_walkin(org_slug=org.slug, event_slug=event.slug, token=guest.entry_token)

    assert metrics[0]["counter"] == "checkins"
    assert metrics[0]["gate"] == "North"
    assert publishes[0]["reason"] == "walkin.claim"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_live_signal_guest_paths.py -q`

Expected: FAIL because schedulers are not imported/wired in these modules.

- [ ] **Step 3: Wire `register_guest`**

In `backend/apps/guests/services.py`, add:

```python
from apps.events.live_publish import schedule_event_changed
```

Before `return guest` in `register_guest`, add:

```python
    schedule_event_changed(
        event_id=event.id,
        reason="guest.registered",
        keys=("stats", "guests_count"),
    )
```

- [ ] **Step 4: Wire guest admin mutations**

In `backend/apps/guests/views.py`, add:

```python
from apps.events.live_publish import schedule_event_changed
```

After each `guest.voided`, `guest.updated`, and `guest.deleted` audit write, schedule:

```python
        schedule_event_changed(
            event_id=guest.event_id,
            reason="guest.voided",
            keys=("stats", "audit", "guests_count"),
        )
```

Use reason `"guest.updated"` in `GuestDetailView.patch`, `"guest.deleted"` in delete paths, and `"guest.bulk_action"` once at the end of `GuestBulkView.post` when `done > 0`.

- [ ] **Step 5: Wire CSV import completion**

In `backend/apps/guests/tasks.py`, add:

```python
from apps.events.live_publish import schedule_event_changed
```

After the final `ci.save(...)` for a complete import:

```python
        schedule_event_changed(
            event_id=ci.event_id,
            reason="csv_import.complete",
            keys=("stats", "audit", "guests_count"),
        )
```

- [ ] **Step 6: Wire walk-in services**

In `backend/apps/walkins/services.py`, add:

```python
from apps.analytics.services import schedule_metric_increment
from apps.events.live_publish import schedule_event_changed
```

After `walkin.display.create` audit:

```python
    schedule_event_changed(
        event_id=device.event_id,
        reason="walkin.display.create",
        keys=("stats", "audit", "guests_count"),
    )
```

After `walkin.claim` audit:

```python
    schedule_metric_increment(
        organization_id=guest.organization_id,
        event_id=guest.event_id,
        counter="checkins",
        gate=guest.gate,
        scanner=guest.scanner,
    )
    schedule_event_changed(
        event_id=guest.event_id,
        reason="walkin.claim",
        keys=("stats", "audit", "guests_count"),
    )
```

After `walkin.info_completed` audit:

```python
    schedule_event_changed(
        event_id=guest.event_id,
        reason="walkin.info_completed",
        keys=("stats", "audit", "guests_count"),
    )
```

- [ ] **Step 7: Run focused and affected suites**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_live_signal_guest_paths.py tests/test_guest_edit.py tests/test_guest_bulk.py tests/test_public_registration.py tests/test_walkin_display_next.py tests/test_walkin_claim.py tests/test_walkin_info.py tests/test_csv_import_task.py -q && uv run mypy apps config`

Expected: PASS, mypy clean.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/guests/services.py backend/apps/guests/views.py backend/apps/guests/tasks.py backend/apps/walkins/services.py backend/tests/test_live_signal_guest_paths.py
git commit -m "feat(events): publish live updates from guest and walkin paths"
```

---

## Task 8: Frontend Live Data Types + `useEventLive`

**Files:**
- Modify: `frontend/lib/event-stats.ts`
- Create: `frontend/lib/event-live.ts`
- Test: `frontend/__tests__/lib/event-live.test.tsx`

**Interfaces:**
- Produces `EventLiveSnapshot` type.
- Produces `useEventLive(orgSlug, eventSlug)` with connection state and polling fallback.

- [ ] **Step 1: Re-read modified Next.js guidance**

Run:

```bash
cd frontend
sed -n '1,120p' AGENTS.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
sed -n '1,180p' node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md
```

Expected: confirms browser APIs/custom hooks belong in Client Components/files with `"use client"`.

- [ ] **Step 2: Write failing hook tests**

```tsx
// frontend/__tests__/lib/event-live.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/event-stats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/event-stats")>("@/lib/event-stats");
  return {
    ...actual,
    useEventStats: vi.fn(() => ({ data: undefined, isLoading: false })),
  };
});

import { useEventLive } from "@/lib/event-live";

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Listener>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    this.listeners.set(type, cb);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("opens the event live URL and stores snapshot events", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useEventLive("acme", "launch"), { wrapper: wrapper(qc) });

  expect(FakeEventSource.instances[0].url).toBe("/api/v1/orgs/acme/events/launch/live/");

  act(() => {
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].emit("snapshot", {
      checked_in: 1,
      registered_not_arrived: 2,
      manual_review: 0,
      displayed: 0,
      total_walkins: 0,
      open_escalations: 0,
      conflicts_recent_15min: 0,
      analytics: { throughput_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null }, peak_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null }, gate_utilization_15m: [], trend_60m: [] },
      recent_activity: [],
      as_of: "2026-06-29T00:00:00Z",
    });
  });

  await waitFor(() => expect(result.current.connectionState).toBe("live"));
  expect(result.current.snapshot?.checked_in).toBe(1);
});

it("invalidates query keys from invalidate events", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  renderHook(() => useEventLive("acme", "launch"), { wrapper: wrapper(qc) });

  act(() => {
    FakeEventSource.instances[0].emit("invalidate", { keys: ["stats", "audit", "helpdesk"] });
  });

  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith({ queryKey: ["event-stats", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["audit", "acme", "launch"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["helpdesk-tickets", "acme", "launch"] });
});

it("falls back to polling after repeated errors", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useEventLive("acme", "launch"), { wrapper: wrapper(qc) });

  act(() => {
    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onerror?.();
  });

  await waitFor(() => expect(result.current.connectionState).toBe("polling"));
  expect(FakeEventSource.instances[0].closed).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm test -- event-live`

Expected: FAIL with missing `@/lib/event-live`.

- [ ] **Step 4: Extend event stats types and polling controls**

Replace `frontend/lib/event-stats.ts` with:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { createEtagCache } from "@/lib/etag-fetch";

export type ThroughputWindow = {
  checkins: number;
  per_minute: number;
  window_start: string | null;
  window_end: string | null;
};

export type GateUtilizationRow = {
  gate: string;
  scanner: string;
  checkins: number;
  duplicates: number;
  conflicts: number;
  share: number;
  per_minute: number;
};

export type TrendPoint = {
  bucket_start: string | null;
  checkins: number;
};

export type RecentActivity = {
  id: string;
  occurred_at: string | null;
  action: string;
  result: "success" | "warning" | "error";
  gate: string;
  scanner: string;
  guest_id: string | null;
  guest_label: string;
};

export type EventAnalytics = {
  throughput_5m: ThroughputWindow;
  peak_5m: ThroughputWindow;
  gate_utilization_15m: GateUtilizationRow[];
  trend_60m: TrendPoint[];
};

export type EventStats = {
  checked_in: number;
  registered_not_arrived: number;
  manual_review: number;
  displayed: number;
  total_walkins: number;
  open_escalations: number;
  conflicts_recent_15min: number;
  analytics?: EventAnalytics;
  recent_activity?: RecentActivity[];
  as_of?: string;
};

export type EventLiveSnapshot = Required<
  Pick<EventStats, "analytics" | "recent_activity">
> &
  EventStats;

const statsEtagCache = createEtagCache();

const fetcher = (url: string): Promise<EventStats> => statsEtagCache.fetchJSON<EventStats>(url);

export function useEventStats(
  orgSlug: string,
  eventSlug: string,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  return useQuery<EventStats>({
    queryKey: ["event-stats", orgSlug, eventSlug],
    queryFn: () => fetcher(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/stats/`),
    enabled: (options.enabled ?? true) && !!orgSlug && !!eventSlug,
    refetchInterval: options.refetchInterval ?? 5_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 5: Implement `useEventLive`**

```ts
// frontend/lib/event-live.ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEventStats, type EventLiveSnapshot } from "@/lib/event-stats";

export type EventLiveConnectionState = "connecting" | "live" | "reconnecting" | "polling";

type InvalidatePayload = { keys?: string[] };

const FAILURE_LIMIT = 3;

function invalidateLiveKeys(
  invalidateQueries: ReturnType<typeof useQueryClient>["invalidateQueries"],
  orgSlug: string,
  eventSlug: string,
  keys: string[],
) {
  if (keys.includes("stats")) {
    invalidateQueries({ queryKey: ["event-stats", orgSlug, eventSlug] });
  }
  if (keys.includes("audit")) {
    invalidateQueries({ queryKey: ["audit", orgSlug, eventSlug] });
  }
  if (keys.includes("helpdesk")) {
    invalidateQueries({ queryKey: ["helpdesk-tickets", orgSlug, eventSlug] });
    invalidateQueries({ queryKey: ["helpdesk-open-count", orgSlug, eventSlug] });
  }
  if (keys.includes("manual_review")) {
    invalidateQueries({ queryKey: ["helpdesk-manual-review", orgSlug, eventSlug] });
  }
  if (keys.includes("guests_count")) {
    invalidateQueries({ queryKey: ["guests-count", orgSlug, eventSlug] });
  }
}

export function useEventLive(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  const [snapshot, setSnapshot] = useState<EventLiveSnapshot | undefined>();
  const [connectionState, setConnectionState] =
    useState<EventLiveConnectionState>("connecting");
  const failures = useRef(0);
  const polling = useEventStats(orgSlug, eventSlug, {
    enabled: connectionState === "polling" || !snapshot,
    refetchInterval: connectionState === "polling" ? 5_000 : false,
  });

  useEffect(() => {
    if (!orgSlug || !eventSlug) return;
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      setConnectionState("polling");
      return;
    }

    failures.current = 0;
    setConnectionState("connecting");
    const source = new EventSource(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/live/`, {
      withCredentials: true,
    });

    source.onopen = () => {
      failures.current = 0;
      setConnectionState("live");
    };
    source.onerror = () => {
      failures.current += 1;
      if (failures.current >= FAILURE_LIMIT) {
        source.close();
        setConnectionState("polling");
      } else {
        setConnectionState("reconnecting");
      }
    };
    source.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse(event.data) as EventLiveSnapshot);
      setConnectionState("live");
    });
    source.addEventListener("invalidate", (event) => {
      const payload = JSON.parse(event.data) as InvalidatePayload;
      invalidateLiveKeys(qc.invalidateQueries.bind(qc), orgSlug, eventSlug, payload.keys ?? []);
    });

    return () => source.close();
  }, [eventSlug, orgSlug, qc]);

  return useMemo(
    () => ({
      snapshot: snapshot ?? (polling.data as EventLiveSnapshot | undefined),
      connectionState,
      isPollingFallback: connectionState === "polling",
      isLoading: !snapshot && polling.isLoading,
    }),
    [connectionState, polling.data, polling.isLoading, snapshot],
  );
}
```

- [ ] **Step 6: Run focused test + typecheck**

Run: `cd frontend && pnpm test -- event-live && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/event-stats.ts frontend/lib/event-live.ts frontend/__tests__/lib/event-live.test.tsx
git commit -m "feat(frontend): add event live stream hook"
```

---

## Task 9: Dashboard Analytics Components

**Files:**
- Create: `frontend/components/events/live-status-badge.tsx`
- Create: `frontend/components/events/throughput-panel.tsx`
- Create: `frontend/components/events/gate-utilization-panel.tsx`
- Create: `frontend/components/events/peak-window-panel.tsx`
- Create: `frontend/components/events/recent-activity-panel.tsx`
- Test: `frontend/__tests__/components/events/live-dashboard-panels.test.tsx`

**Interfaces:**
- Components render analytics from `EventLiveSnapshot` without fetching.

- [ ] **Step 1: Write failing component tests**

```tsx
// frontend/__tests__/components/events/live-dashboard-panels.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { GateUtilizationPanel } from "@/components/events/gate-utilization-panel";
import { LiveStatusBadge } from "@/components/events/live-status-badge";
import { PeakWindowPanel } from "@/components/events/peak-window-panel";
import { RecentActivityPanel } from "@/components/events/recent-activity-panel";
import { ThroughputPanel } from "@/components/events/throughput-panel";
import type { EventAnalytics, RecentActivity } from "@/lib/event-stats";

const analytics: EventAnalytics = {
  throughput_5m: {
    checkins: 18,
    per_minute: 3.6,
    window_start: "2026-06-29T12:20:00Z",
    window_end: "2026-06-29T12:25:00Z",
  },
  peak_5m: {
    checkins: 42,
    per_minute: 8.4,
    window_start: "2026-06-29T11:40:00Z",
    window_end: "2026-06-29T11:45:00Z",
  },
  gate_utilization_15m: [
    { gate: "North", scanner: "A1", checkins: 34, duplicates: 2, conflicts: 1, share: 0.48, per_minute: 2.27 },
  ],
  trend_60m: [{ bucket_start: "2026-06-29T12:20:00Z", checkins: 3 }],
};

const activity: RecentActivity[] = [
  {
    id: "a1",
    occurred_at: "2026-06-29T12:24:03Z",
    action: "checkin.success",
    result: "success",
    gate: "North",
    scanner: "A1",
    guest_id: "g1",
    guest_label: "Ana",
  },
];

it("renders live status labels", () => {
  render(<LiveStatusBadge state="live" />);
  expect(screen.getByText("Live")).toBeInTheDocument();
});

it("renders throughput and peak metrics", () => {
  render(<ThroughputPanel analytics={analytics} />);
  expect(screen.getByText("3.6/min")).toBeInTheDocument();
  render(<PeakWindowPanel analytics={analytics} />);
  expect(screen.getByText("42")).toBeInTheDocument();
});

it("renders gate utilization and recent activity", () => {
  render(<GateUtilizationPanel analytics={analytics} />);
  expect(screen.getByText("North")).toBeInTheDocument();
  render(<RecentActivityPanel items={activity} />);
  expect(screen.getByText("Ana")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- live-dashboard-panels`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `LiveStatusBadge`**

```tsx
// frontend/components/events/live-status-badge.tsx
"use client";

import type { EventLiveConnectionState } from "@/lib/event-live";
import { cn } from "@/lib/utils";

const LABELS: Record<EventLiveConnectionState, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  polling: "Polling",
};

export function LiveStatusBadge({ state }: { state: EventLiveConnectionState }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs font-medium",
        state === "live" && "border-emerald-300 bg-emerald-50 text-emerald-800",
        state === "reconnecting" && "border-warning/30 bg-warning/10 text-warning",
        state === "polling" && "border-muted-foreground/30 bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", state === "live" ? "bg-emerald-500" : "bg-muted-foreground")} />
      {LABELS[state]}
    </span>
  );
}
```

- [ ] **Step 4: Implement analytics panels**

```tsx
// frontend/components/events/throughput-panel.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

export function ThroughputPanel({ analytics }: { analytics?: EventAnalytics }) {
  const t = analytics?.throughput_5m;
  const points = analytics?.trend_60m ?? [];
  const max = Math.max(1, ...points.map((p) => p.checkins));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Throughput</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{t ? `${t.per_minute}/min` : "0/min"}</div>
        <div className="text-xs text-muted-foreground">{t?.checkins ?? 0} check-ins in 5m</div>
        <div className="mt-3 flex h-12 items-end gap-px" aria-label="60 minute check-in trend">
          {points.slice(-60).map((p, i) => (
            <div key={`${p.bucket_start}-${i}`} className="min-w-0 flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(4, (p.checkins / max) * 48)}px` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

```tsx
// frontend/components/events/peak-window-panel.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

function timeLabel(value: string | null | undefined) {
  if (!value) return "No peak yet";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PeakWindowPanel({ analytics }: { analytics?: EventAnalytics }) {
  const p = analytics?.peak_5m;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Peak 5m Window</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{p?.checkins ?? 0}</div>
        <div className="text-xs text-muted-foreground">
          {timeLabel(p?.window_start)} - {timeLabel(p?.window_end)}
        </div>
        <div className="mt-2 text-xs tabular-nums text-muted-foreground">{p?.per_minute ?? 0}/min peak</div>
      </CardContent>
    </Card>
  );
}
```

```tsx
// frontend/components/events/gate-utilization-panel.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

export function GateUtilizationPanel({ analytics }: { analytics?: EventAnalytics }) {
  const rows = analytics?.gate_utilization_15m ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Gate Utilization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gate activity in the last 15 minutes.</p>
        ) : (
          rows.map((row) => (
            <div key={`${row.gate}-${row.scanner}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{row.gate}{row.scanner ? ` / ${row.scanner}` : ""}</span>
                <span className="shrink-0 tabular-nums">{Math.round(row.share * 100)}%</span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-primary" style={{ width: `${Math.max(4, row.share * 100)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{row.checkins} check-ins · {row.per_minute}/min</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// frontend/components/events/recent-activity-panel.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentActivity } from "@/lib/event-stats";

function actionLabel(action: string) {
  return action.replaceAll("_", " ").replaceAll(".", " · ");
}

export function RecentActivityPanel({ items }: { items?: RecentActivity[] }) {
  const rows = items ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent operational activity.</p>
        ) : (
          rows.map((item) => (
            <div key={item.id} className="grid grid-cols-[88px_1fr] gap-3 text-sm">
              <span className="text-xs tabular-nums text-muted-foreground">
                {item.occurred_at ? new Date(item.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{item.guest_label || actionLabel(item.action)}</div>
                <div className="truncate text-xs text-muted-foreground">{actionLabel(item.action)}{item.gate ? ` · ${item.gate}` : ""}</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run tests + lint for components**

Run: `cd frontend && pnpm test -- live-dashboard-panels && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`

Expected: PASS. If Prettier fails, run `pnpm format`, then re-run `pnpm format:check`.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/events/live-status-badge.tsx frontend/components/events/throughput-panel.tsx frontend/components/events/gate-utilization-panel.tsx frontend/components/events/peak-window-panel.tsx frontend/components/events/recent-activity-panel.tsx frontend/__tests__/components/events/live-dashboard-panels.test.tsx
git commit -m "feat(frontend): add live dashboard analytics panels"
```

---

## Task 10: Wire Command-Center Dashboard Page

**Files:**
- Modify: `frontend/components/events/stats-widget.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`
- Modify: `frontend/__tests__/components/events/stats-widget.test.tsx`
- Modify: `frontend/__tests__/app/event-dashboard-page.test.tsx`

**Interfaces:**
- Event dashboard calls `useEventLive`.
- Count tiles use live snapshot when available.
- Analytics panels render below critical counts.

- [ ] **Step 1: Update failing page test expectation**

Modify `frontend/__tests__/app/event-dashboard-page.test.tsx` mocks:

```tsx
vi.mock("@/lib/event-live", () => ({
  useEventLive: () => ({
    snapshot: {
      checked_in: 1,
      registered_not_arrived: 2,
      manual_review: 0,
      displayed: 0,
      total_walkins: 0,
      open_escalations: 0,
      conflicts_recent_15min: 0,
      analytics: {
        throughput_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null },
        peak_5m: { checkins: 0, per_minute: 0, window_start: null, window_end: null },
        gate_utilization_15m: [],
        trend_60m: [],
      },
      recent_activity: [],
    },
    connectionState: "live",
    isLoading: false,
  }),
}));
```

Add an assertion:

```tsx
expect(screen.getByText("Live")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- event-dashboard-page`

Expected: FAIL because the page does not import/use `useEventLive`.

- [ ] **Step 3: Modify `StatsWidget` to accept live data**

Replace component signature and data selection in `frontend/components/events/stats-widget.tsx`:

```tsx
import type { EventStats } from "@/lib/event-stats";

export function StatsWidget({
  orgSlug,
  eventSlug,
  snapshot,
}: {
  orgSlug: string;
  eventSlug: string;
  snapshot?: EventStats;
}) {
  const { data: polledData, isLoading } = useEventStats(orgSlug, eventSlug, {
    enabled: !snapshot,
    refetchInterval: snapshot ? false : 5_000,
  });
  const data = snapshot ?? polledData;
```

Keep the existing tile definitions and skeleton behavior.

- [ ] **Step 4: Wire dashboard page**

Modify `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` imports:

```tsx
import { GateUtilizationPanel } from "@/components/events/gate-utilization-panel";
import { LiveStatusBadge } from "@/components/events/live-status-badge";
import { PeakWindowPanel } from "@/components/events/peak-window-panel";
import { RecentActivityPanel } from "@/components/events/recent-activity-panel";
import { ThroughputPanel } from "@/components/events/throughput-panel";
import { useEventLive } from "@/lib/event-live";
```

Inside `EventDashboardPage`, after `useEvent`:

```tsx
  const live = useEventLive(slug, eventSlug);
```

Replace the header block with:

```tsx
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.slug} · {event.status} · {event.venue || "—"}
          </p>
        </div>
        <LiveStatusBadge state={live.connectionState} />
      </div>
```

Replace `<StatsWidget orgSlug={slug} eventSlug={eventSlug} />` with:

```tsx
      <StatsWidget orgSlug={slug} eventSlug={eventSlug} snapshot={live.snapshot} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_0.9fr]">
        <ThroughputPanel analytics={live.snapshot?.analytics} />
        <GateUtilizationPanel analytics={live.snapshot?.analytics} />
        <PeakWindowPanel analytics={live.snapshot?.analytics} />
      </div>

      <RecentActivityPanel items={live.snapshot?.recent_activity} />
```

- [ ] **Step 5: Update stats widget tests**

In `frontend/__tests__/components/events/stats-widget.test.tsx`, keep existing tests and add:

```tsx
it("renders supplied live snapshot without showing skeletons", () => {
  mockStats.mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useEventStats>);

  render(
    <StatsWidget
      orgSlug="o"
      eventSlug="e"
      snapshot={{
        checked_in: 7,
        registered_not_arrived: 2,
        displayed: 0,
        manual_review: 0,
        total_walkins: 0,
        open_escalations: 0,
        conflicts_recent_15min: 0,
      }}
    />,
  );

  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.queryByRole("status")).toBeNull();
});
```

- [ ] **Step 6: Run focused and full frontend gates**

Run: `cd frontend && pnpm test -- event-dashboard-page stats-widget live-dashboard-panels event-live && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`

Expected: PASS. If Prettier fails, run `pnpm format`, then re-run `pnpm format:check`.

- [ ] **Step 7: Commit**

```bash
git add 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx' frontend/components/events/stats-widget.tsx frontend/__tests__/app/event-dashboard-page.test.tsx frontend/__tests__/components/events/stats-widget.test.tsx
git commit -m "feat(frontend): wire live command-center dashboard"
```

---

## Task 11: ASGI Deployment Configuration

**Files:**
- Modify: `backend/fly.prod.toml`
- Modify: `backend/Dockerfile`

**Interfaces:**
- Public backend `app` process runs ASGI uvicorn.
- Worker/beat stay unchanged.

- [ ] **Step 1: Change Fly app process command**

In `backend/fly.prod.toml`, replace:

```toml
  app = "gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --access-logfile - --error-logfile -"
```

with:

```toml
  app = "uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"
```

- [ ] **Step 2: Change Docker runtime default command**

In `backend/Dockerfile`, replace the runtime `CMD` array with:

```dockerfile
CMD ["uvicorn", "config.asgi:application", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
```

- [ ] **Step 3: Run backend config checks**

Run: `cd backend && uv run python manage.py check && uv run mypy apps config`

Expected: PASS.

- [ ] **Step 4: Local uvicorn smoke**

Run:

```bash
cd backend
POSTGRES_PORT=5442 timeout 8 uv run uvicorn config.asgi:application --host 127.0.0.1 --port 8010
```

Expected: process starts and `timeout` stops it after 8 seconds. If port `8010` is occupied, use `8011` and record the deviation in the plan completion log.

- [ ] **Step 5: Commit**

```bash
git add backend/fly.prod.toml backend/Dockerfile
git commit -m "chore(backend): run web process under ASGI"
```

---

## Task 12: Full Verification + Plan Closeout

**Files:**
- Modify: `docs/superpowers/plans/2026-06-27-dashboard-sse.md`
- Modify: `docs/handoff-2026-06-27-next-session-brief.md`

**Interfaces:**
- Records actual verification results and any implementation deviations.

- [x] **Step 1: Run full backend gates**

Run:

```bash
cd backend
POSTGRES_PORT=5442 uv run pytest -q
uv run mypy apps config
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py check
```

Expected: all pass, no pending migrations beyond committed `analytics.0001`.

- [x] **Step 2: Run full frontend gates**

Run:

```bash
cd frontend
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

Expected: all pass. Existing `<img>` lint warnings, if still present, remain warnings only.

- [x] **Step 3: Manual local live smoke**

Run services:

```bash
docker compose up -d postgres redis
cd backend
POSTGRES_PORT=${POSTGRES_PORT:-5442} uv run python manage.py migrate --noinput
POSTGRES_PORT=${POSTGRES_PORT:-5442} REDIS_URL=redis://localhost:${REDIS_PORT:-6379}/0 uv run uvicorn config.asgi:application --host 127.0.0.1 --port 8010
```

In another shell, authenticate through the frontend or use an existing dev cookie, then open:

```text
http://127.0.0.1:8010/api/v1/orgs/<org>/events/<event>/live/
```

Expected: response begins with an SSE `event: snapshot` frame. Perform one scanner check-in, then confirm a new `analytics_eventgateminutemetric` row exists and a connected dashboard updates without waiting for a 5s polling interval.

- [x] **Step 4: Update this plan's completion log**

Append:

```markdown
## Completion Log

- Branch:
- Commits:
- Backend verification:
- Frontend verification:
- Manual SSE smoke:
- Deviations:
- Follow-ups:
```

Fill every line with concrete results from this implementation.

- [x] **Step 5: Update handoff brief**

In `docs/handoff-2026-06-27-next-session-brief.md`, update slice #4 status and note:

- ASGI web process conversion
- SSE endpoint path
- materialized analytics table
- frontend fallback behavior
- any deployment caveats found during verification

- [x] **Step 6: Commit closeout docs**

```bash
git add docs/superpowers/plans/2026-06-27-dashboard-sse.md docs/handoff-2026-06-27-next-session-brief.md
git commit -m "docs(dashboard): record SSE live data verification"
```

---

## Completion Log

- Branch: `topic/dashboard-sse-live-data`
- Commits:
  - `9d518b5` `docs(dashboard): design SSE live data slice`
  - `3752fcc` `docs(dashboard): plan SSE live data implementation`
  - `4c1e6f1` `feat(analytics): add event gate minute metric model`
  - `b80ec17` `feat(analytics): increment event gate minute metrics`
  - `e0fbe71` `feat(events): build live dashboard snapshot for stats`
  - `dc6babb` `feat(events): publish live dashboard change hints`
  - `0c354ea` `feat(events): add SSE live dashboard endpoint`
  - `2add59f` `chore(backend): run web process under ASGI`
  - `90547bc` `fix(events): harden SSE live stream`
  - `ce35aea` `feat(events): publish live updates from checkin and helpdesk paths`
  - `d371e07` `feat(events): publish live updates from guest and walkin paths`
  - `63d6d43` `fix(guests): correct bulk live signal publishing`
  - `4588099` `feat(frontend): add event live stream hook`
  - `e5a90d4` `fix(frontend): align event live fallback types`
  - `b4ed6d8` `fix(frontend): prefer polling data after live fallback`
  - `1a85b57` `feat(frontend): add live dashboard analytics panels`
  - `7501c3f` `feat(frontend): wire live command-center dashboard`
  - `8caee79` `fix(frontend): defer live dashboard until event loads`
  - `898d9cf` `test(integrations): account for live registration callback`
  - `3cd3424` `fix(events): refresh SSE snapshots during quiet periods`
- Backend verification:
  - `POSTGRES_PORT=5442 uv run pytest -q` passed: `490 passed, 416 warnings`.
  - `uv run mypy apps config` passed: `Success: no issues found in 185 source files`.
  - `DATABASE_URL=postgres://eventgate:eventgate@localhost:5442/eventgate uv run python manage.py makemigrations --check --dry-run` passed: `No changes detected`.
  - `DATABASE_URL=postgres://eventgate:eventgate@localhost:5442/eventgate uv run python manage.py check` passed: `System check identified no issues (0 silenced).`
- Frontend verification:
  - `pnpm test` passed: `94 passed`, `369 passed`.
  - `pnpm exec tsc --noEmit` passed.
  - `pnpm lint` passed with the pre-existing three `<img>` warnings in `event-presentation-editor.tsx`, `registration-form.tsx`, and `walkins/info-form.tsx`.
  - `pnpm format:check` passed: `All matched files use Prettier code style!`
- Manual SSE smoke:
  - Ran local Postgres on host port `5442` and Redis on host port `6389` because `6379` and `6380` were occupied.
  - Migrated local DB, seeded `dev-acme/dev-conf`, started `uvicorn config.asgi:application --host 127.0.0.1 --port 8010`.
  - Authenticated with a locally minted `eventgate_access` cookie and opened `/api/v1/orgs/dev-acme/events/dev-conf/live/`.
  - SSE returned `200 OK`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, and an initial `event: snapshot` frame.
  - Performed two service-path scanner check-ins. The open SSE stream received `event: invalidate` with reason `checkin.success`, followed immediately by a refreshed `event: snapshot` showing `checked_in: 2`, throughput `2`, gate utilization for `North / Smoke Scanner`, and recent activity for Alice and Bob.
  - `analytics_eventgateminutemetric` contained two persisted minute rows with `checkins: 1` each.
- Deviations:
  - Task 11 ASGI deployment conversion was pulled forward before completing Task 5 hardening because streaming SSE under the current WSGI runtime would have been misleading.
  - The SSE stream subscribes to Redis before sending the initial snapshot to avoid missing changes during connection setup.
  - Idle SSE heartbeats now also emit a fresh `snapshot` frame so rolling metrics
    such as throughput, gate utilization, and conflict windows decay during quiet
    periods without re-enabling frontend polling.
  - CSV import currently emits per-row `guest.registered` invalidations via `register_guest()` plus a final `csv_import.complete` invalidation. Review accepted this as matching the written plan; future batch coalescing can suppress per-row live signals if imports become large.
  - Bulk delete now emits per-guest `guest.deleted` signals plus final `guest.bulk_action`; bulk `resend_qr` intentionally emits no dashboard invalidation.
  - Google Form bridge tests now expect two accepted-registration on-commit callbacks: QR email plus live dashboard invalidation.
- Follow-ups:
  - Consider coalescing CSV/bulk live invalidations if larger imports create noticeable SSE churn.
  - Consider a future integration-style frontend test with real React Query fallback fetch, not only mocked `useEventStats`.
  - Existing frontend `<img>` lint warnings remain unrelated to this slice.

---

## Self-Review

- **Spec coverage:** Task 1-2 cover persisted minute metrics. Task 3 covers snapshot, analytics, recent activity, and `/stats/` compatibility. Task 4-5 cover Redis publish and SSE. Task 6-7 cover mutation publishers and metric increments. Task 8-10 cover live hook, fallback, invalidation, and command-center dashboard. Task 11 covers ASGI deploy. Task 12 covers verification and handoff closeout.
- **Red-flag scan:** no banned markers or open-ended "add tests" steps. Every code-changing task has concrete snippets and commands.
- **Type consistency:** backend uses `checkins | duplicates | conflicts | escalations` counters throughout; frontend uses `EventLiveSnapshot`, `EventAnalytics`, `RecentActivity`, and `EventLiveConnectionState` consistently across hook and components.

## Out of Scope

WebSockets, Django Channels, separate analytics page, historical metric rebuild command, named-staff identity, gate/scanner registry modeling, production Fly billing recovery, and changing append-only audit semantics.
