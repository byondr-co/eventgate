from datetime import UTC, datetime

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
    bucket = datetime(2026, 6, 29, 12, 30, tzinfo=UTC)
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
    bucket = datetime(2026, 6, 29, 12, 31, tzinfo=UTC)
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


def test_metric_without_organization_derives_organization_from_event(event):
    bucket = datetime(2026, 6, 29, 12, 32, tzinfo=UTC)
    metric = EventGateMinuteMetric.objects.create(
        event=event,
        bucket_start=bucket,
        gate="North",
        scanner="A1",
    )

    metric.refresh_from_db()

    assert metric.organization_id == event.organization_id


def test_metric_with_wrong_organization_is_corrected_to_event_organization(event):
    wrong_org = Organization.objects.create(name="Beta", slug="beta")
    bucket = datetime(2026, 6, 29, 12, 33, tzinfo=UTC)
    metric = EventGateMinuteMetric.objects.create(
        organization=wrong_org,
        event=event,
        bucket_start=bucket,
        gate="North",
        scanner="A2",
    )

    metric.refresh_from_db()

    assert metric.organization_id == event.organization_id


def test_metric_save_with_update_fields_persists_derived_organization(event):
    wrong_org = Organization.objects.create(name="Beta", slug="beta")
    other_org = Organization.objects.create(name="Other", slug="other")
    bucket = datetime(2026, 6, 29, 12, 34, tzinfo=UTC)
    metric = EventGateMinuteMetric.objects.create(
        organization=wrong_org,
        event=event,
        bucket_start=bucket,
        gate="North",
        scanner="A3",
    )

    metric.organization = other_org
    metric.checkins = 2
    metric.save(update_fields=("checkins",))
    metric.refresh_from_db()

    assert metric.organization_id == event.organization_id
    assert metric.checkins == 2
