from __future__ import annotations

import hashlib
from collections import deque
from datetime import UTC, datetime, timedelta
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
    "helpdesk.ticket_released",
    "helpdesk.ticket_resolved",
)


def _minute_floor(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=UTC)
    return dt.astimezone(UTC).replace(second=0, microsecond=0)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _metric_rows(event: Event, *, since: datetime | None = None, before: datetime | None = None):
    qs = EventGateMinuteMetric.objects.filter(event=event)
    if since is not None:
        qs = qs.filter(bucket_start__gte=since)
    if before is not None:
        qs = qs.filter(bucket_start__lt=before)
    return qs


def _throughput(event: Event, *, now_floor: datetime) -> dict[str, Any]:
    start = now_floor - timedelta(minutes=4)
    end = now_floor + timedelta(minutes=1)
    total = (
        _metric_rows(event, since=start, before=end).aggregate(total=Sum("checkins")).get("total")
        or 0
    )
    return {
        "checkins": total,
        "per_minute": round(total / 5, 2),
        "window_start": _iso(start),
        "window_end": _iso(end),
    }


def _peak(event: Event, *, now_floor: datetime) -> dict[str, Any]:
    end = now_floor + timedelta(minutes=1)
    rows = (
        _metric_rows(event, before=end)
        .values("bucket_start")
        .annotate(checkins=Sum("checkins"))
        .order_by("bucket_start")
    )
    bucket_counts = {row["bucket_start"]: row["checkins"] or 0 for row in rows}
    if not bucket_counts:
        return {"checkins": 0, "per_minute": 0.0, "window_start": None, "window_end": None}

    window: deque[tuple[datetime, int]] = deque()
    best_start = next(iter(bucket_counts))
    best_total = 0
    current_total = 0
    for bucket, count in bucket_counts.items():
        window.append((bucket, count))
        current_total += count
        while window and bucket >= window[0][0] + timedelta(minutes=5):
            _, expired_count = window.popleft()
            current_total -= expired_count
        if current_total > best_total:
            best_total = current_total
            best_start = window[0][0]
    return {
        "checkins": best_total,
        "per_minute": round(best_total / 5, 2),
        "window_start": _iso(best_start),
        "window_end": _iso(best_start + timedelta(minutes=5)),
    }


def _gate_utilization(event: Event, *, now_floor: datetime) -> list[dict[str, Any]]:
    start = now_floor - timedelta(minutes=14)
    end = now_floor + timedelta(minutes=1)
    rows = (
        _metric_rows(event, since=start, before=end)
        .values("gate", "scanner")
        .annotate(
            checkins=Sum("checkins"), duplicates=Sum("duplicates"), conflicts=Sum("conflicts")
        )
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
    end = now_floor + timedelta(minutes=1)
    rows = (
        _metric_rows(event, since=start, before=end)
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

    status_counts = Guest.objects.filter(event=event).values("entry_status").annotate(n=Count("id"))
    bucket = {row["entry_status"]: row["n"] for row in status_counts}
    total_walkins = Guest.objects.filter(event=event, guest_type="walk_in").count()
    open_escalations = HelpDeskTicketState.objects.filter(
        event=event, claim_status__in=("open", "claimed")
    ).count()
    cutoff = now_floor - timedelta(minutes=14)
    end = now_floor + timedelta(minutes=1)
    conflicts_recent = AuditEvent.objects.filter(
        event=event,
        action="checkin.conflict",
        occurred_at__gte=cutoff,
        occurred_at__lt=end,
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
            "peak_5m": _peak(event, now_floor=now_floor),
            "gate_utilization_15m": _gate_utilization(event, now_floor=now_floor),
            "trend_60m": _trend(event, now_floor=now_floor),
        },
        "recent_activity": _recent_activity(event),
        "as_of": _iso(now_dt),
    }


def event_live_etag(event: Event, *, now: datetime | None = None) -> str:
    now_floor = _minute_floor(now or timezone.now())
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
        f"{_iso(now_floor)}-"
        f"{guest_agg['latest']}-{guest_agg['n']}-"
        f"{ticket_agg['latest']}-{ticket_agg['n']}-"
        f"{audit_agg['latest']}-{audit_agg['n']}-"
        f"{metric_agg['latest']}-{metric_agg['n']}"
    )
    return f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
