from datetime import UTC, datetime

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
    dt = datetime(2026, 6, 29, 12, 30, 45, 123, tzinfo=UTC)
    assert minute_floor(dt) == datetime(2026, 6, 29, 12, 30, tzinfo=UTC)


def test_minute_floor_treats_naive_datetime_as_utc():
    dt = datetime(2026, 6, 29, 12, 30, 45, 123)
    assert minute_floor(dt) == datetime(2026, 6, 29, 12, 30, tzinfo=UTC)


def test_increment_event_metric_creates_and_increments_same_bucket(event):
    at = datetime(2026, 6, 29, 12, 30, 45, tzinfo=UTC)
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
    assert metric.bucket_start == datetime(2026, 6, 29, 12, 30, tzinfo=UTC)
    assert metric.checkins == 2


def test_increment_event_metric_advances_updated_at_on_existing_bucket(event, monkeypatch):
    at = datetime(2026, 6, 29, 12, 30, 45, tzinfo=UTC)
    increment_event_metric(
        organization_id=event.organization_id,
        event_id=event.id,
        counter="checkins",
        occurred_at=at,
        gate="North",
        scanner="A1",
    )
    metric = EventGateMinuteMetric.objects.get(event=event, gate="North", scanner="A1")
    first_updated_at = metric.updated_at

    frozen_now = datetime(2099, 1, 1, 9, 0, tzinfo=UTC)
    monkeypatch.setattr("apps.analytics.services.timezone.now", lambda: frozen_now)
    increment_event_metric(
        organization_id=event.organization_id,
        event_id=event.id,
        counter="checkins",
        occurred_at=at,
        gate="North",
        scanner="A1",
    )

    metric.refresh_from_db()
    assert metric.checkins == 2
    assert metric.updated_at == frozen_now
    assert metric.updated_at > first_updated_at


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
            occurred_at=datetime(2026, 6, 29, 12, 31, tzinfo=UTC),
            gate="South",
            scanner="B1",
        )
        assert EventGateMinuteMetric.objects.count() == 0

    metric = EventGateMinuteMetric.objects.get(event=event, gate="South", scanner="B1")
    assert metric.duplicates == 1
