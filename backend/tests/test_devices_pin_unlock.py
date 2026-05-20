import pytest
from rest_framework.test import APIClient

from apps.devices.services import complete_enrollment, create_device, revoke_device
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _enroll():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "4242")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, device_token = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    return event, d, device_token


def test_unlock_with_correct_pin():
    _event, _device, dt = _enroll()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 200
    assert "session_token" in r.data
    assert "expires_at" in r.data


def test_unlock_wrong_pin():
    _event, _device, dt = _enroll()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "0000"}, format="json")
    assert r.status_code == 403


def test_unlock_no_device_token():
    c = APIClient()
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 401


def test_unlock_revoked_device_fails():
    _event, device, dt = _enroll()
    revoke_device(device)
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 401
