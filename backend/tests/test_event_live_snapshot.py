from datetime import UTC, datetime, timedelta

import pytest
from django.utils import timezone

from apps.analytics.models import EventGateMinuteMetric
from apps.audit.models import AuditEvent
from apps.audit.services import write_audit
from apps.events.live_snapshot import build_event_live_snapshot, event_live_etag
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
    now = timezone.now().astimezone(UTC).replace(second=0, microsecond=0)
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
    assert analytics["peak_5m"] == {
        "checkins": 12,
        "per_minute": 2.4,
        "window_start": (now - timedelta(minutes=2)).isoformat().replace("+00:00", "Z"),
        "window_end": (now + timedelta(minutes=3)).isoformat().replace("+00:00", "Z"),
    }
    assert analytics["gate_utilization_15m"][0]["checkins"] >= 5
    assert len(analytics["trend_60m"]) == 60


def test_snapshot_excludes_future_metric_buckets_from_rolling_windows(event):
    now = datetime(2026, 6, 30, 12, 0, tzinfo=UTC)
    EventGateMinuteMetric.objects.create(
        organization=event.organization,
        event=event,
        bucket_start=now,
        gate="North",
        scanner="A1",
        checkins=3,
    )
    EventGateMinuteMetric.objects.create(
        organization=event.organization,
        event=event,
        bucket_start=now + timedelta(minutes=1),
        gate="Future",
        scanner="B1",
        checkins=100,
    )

    body = build_event_live_snapshot(event, now=now)
    analytics = body["analytics"]

    assert analytics["throughput_5m"]["checkins"] == 3
    assert analytics["peak_5m"] == {
        "checkins": 3,
        "per_minute": 0.6,
        "window_start": "2026-06-30T12:00:00Z",
        "window_end": "2026-06-30T12:05:00Z",
    }
    assert analytics["gate_utilization_15m"] == [
        {
            "gate": "North",
            "scanner": "A1",
            "checkins": 3,
            "duplicates": 0,
            "conflicts": 0,
            "share": 1.0,
            "per_minute": 0.2,
        }
    ]
    assert analytics["trend_60m"][-1] == {
        "bucket_start": "2026-06-30T12:00:00Z",
        "checkins": 3,
    }
    assert sum(bucket["checkins"] for bucket in analytics["trend_60m"]) == 3


def test_snapshot_conflicts_recent_uses_minute_bucket_window(event):
    now = datetime(2026, 6, 30, 12, 0, 30, tzinfo=UTC)
    now_floor = now.replace(second=0, microsecond=0)
    for occurred_at in [now_floor - timedelta(minutes=14), now_floor + timedelta(minutes=2)]:
        AuditEvent.objects.create(
            organization=event.organization,
            event=event,
            occurred_at=occurred_at,
            actor_type="system",
            actor_id="s",
            action="checkin.conflict",
            result="warning",
        )

    assert build_event_live_snapshot(event, now=now)["conflicts_recent_15min"] == 1
    assert (
        build_event_live_snapshot(event, now=now + timedelta(seconds=20))["conflicts_recent_15min"]
        == 1
    )
    assert (
        build_event_live_snapshot(event, now=now_floor + timedelta(minutes=1))[
            "conflicts_recent_15min"
        ]
        == 0
    )


def test_live_etag_changes_when_minute_bucket_changes_without_db_mutation(event):
    now = datetime(2026, 6, 30, 12, 0, 10, tzinfo=UTC)

    first = event_live_etag(event, now=now)
    same_bucket = event_live_etag(event, now=now + timedelta(seconds=30))
    next_bucket = event_live_etag(event, now=now + timedelta(minutes=1))

    assert same_bucket == first
    assert next_bucket != first


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


def test_snapshot_recent_activity_includes_helpdesk_ticket_release(event):
    audit = write_audit(
        organization=event.organization,
        event=event,
        actor_type="user",
        actor_id="staff",
        action="helpdesk.ticket_released",
        result="success",
    )

    body = build_event_live_snapshot(event)

    assert body["recent_activity"][0]["id"] == str(audit.id)
    assert body["recent_activity"][0]["action"] == "helpdesk.ticket_released"
