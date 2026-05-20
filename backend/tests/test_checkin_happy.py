import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _enrolled_scanner():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    return event, d, session_token


def _guest(event):
    return register_guest(
        event=event,
        payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"},
    )


def test_checkin_happy_path():
    event, _device, st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post(
        "/api/v1/checkins/",
        {
            "token": g.entry_token,
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "k1",
        },
        format="json",
    )
    assert r.status_code == 200
    assert r.data["status"] == "success"
    assert r.data["guest"]["full_name"] == "A"
    g.refresh_from_db()
    assert g.entry_status == "checked_in"
    assert g.gate == "G1"
    assert g.scanner == "L1"
    assert g.checked_in_at is not None
    assert AuditEvent.objects.filter(action="checkin.success").count() == 1


def test_checkin_token_not_found():
    _event, _device, st = _enrolled_scanner()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post(
        "/api/v1/checkins/",
        {
            "token": "no-such-token",
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "k2",
        },
        format="json",
    )
    assert r.status_code == 404
    assert AuditEvent.objects.filter(action="checkin.token_not_found").count() == 1


def test_checkin_duplicate_returns_409():
    event, _device, st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    c.post(
        "/api/v1/checkins/",
        {
            "token": g.entry_token,
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "ka",
        },
        format="json",
    )
    r = c.post(
        "/api/v1/checkins/",
        {
            "token": g.entry_token,
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "kb",  # different key — bypasses idempotency cache
        },
        format="json",
    )
    assert r.status_code == 409
    assert r.data["status"] == "duplicate"
    assert AuditEvent.objects.filter(action="checkin.duplicate").count() == 1


def test_checkin_requires_scanner_role():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    # walkin_display device tries to check in
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(
        event=event,
        payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"},
    )

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {session_token}")
    r = c.post(
        "/api/v1/checkins/",
        {
            "token": g.entry_token,
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "kw",
        },
        format="json",
    )
    assert r.status_code == 403


def test_checkin_without_session_token_401():
    event, _device, _st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient()
    r = c.post(
        "/api/v1/checkins/",
        {
            "token": g.entry_token,
            "gate": "G1",
            "scanner_label": "L1",
            "client_idempotency_key": "k",
        },
        format="json",
    )
    assert r.status_code == 401
