import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def test_replayed_idempotency_key_returns_same_payload():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(
        event=event,
        payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"},
    )

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    body = {
        "token": g.entry_token,
        "gate": "G1",
        "scanner_label": "L1",
        "client_idempotency_key": "same-key",
    }
    r1 = c.post("/api/v1/checkins/", body, format="json")
    r2 = c.post("/api/v1/checkins/", body, format="json")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.data == r2.data
    # Audit row is NOT duplicated for the replayed idempotency key
    assert AuditEvent.objects.filter(action="checkin.success").count() == 1
