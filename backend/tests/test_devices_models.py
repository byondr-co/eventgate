import pytest
from django.db import IntegrityError

from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    org = Organization.objects.create(name="O", slug="o")
    return Event.objects.create(organization=org, name="E", slug="e")


def test_create_device(event):
    d = ScannerDevice.objects.create(
        organization=event.organization,
        event=event,
        label="Gate 1 Lane A",
        role="scanner",
        device_token_hash="h",
    )
    assert d.organization_id == event.organization_id
    assert d.role == "scanner"
    assert d.revoked_at is None


def test_unique_label_per_event_per_role(event):
    ScannerDevice.objects.create(
        organization=event.organization,
        event=event,
        label="G1",
        role="scanner",
        device_token_hash="h",
    )
    with pytest.raises(IntegrityError):
        ScannerDevice.objects.create(
            organization=event.organization,
            event=event,
            label="G1",
            role="scanner",
            device_token_hash="h2",
        )


def test_same_label_ok_across_roles(event):
    ScannerDevice.objects.create(
        organization=event.organization,
        event=event,
        label="G1",
        role="scanner",
        device_token_hash="h",
    )
    ScannerDevice.objects.create(
        organization=event.organization,
        event=event,
        label="G1",
        role="walkin_display",
        device_token_hash="h2",
    )
    assert ScannerDevice.objects.count() == 2


def test_pin_session_links_device(event):
    d = ScannerDevice.objects.create(
        organization=event.organization,
        event=event,
        label="G1",
        role="scanner",
        device_token_hash="h",
    )
    s = EventPinSession.objects.create(event=event, scanner_device=d, session_token_hash="t")
    assert s.event_id == event.id
    assert s.scanner_device_id == d.id
    assert s.unlocked_at is not None
