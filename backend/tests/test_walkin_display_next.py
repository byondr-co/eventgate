import pytest
from rest_framework.test import APIClient

from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _display_session():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    return event, d, st


def test_next_creates_new_walkin():
    _event, _d, st = _display_session()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post(
        "/api/v1/walkins/displays/next/",
        {"gate": "G1", "scanner_label": "S1"},
        format="json",
    )
    assert r.status_code == 200
    assert "entry_token" in r.data
    assert r.data["claim_url"].endswith(f"/claim/{r.data['entry_token']}/")
    g = Guest.objects.get(id=r.data["guest_id"])
    assert g.guest_type == "walk_in"
    assert g.entry_status == "displayed"


def test_next_returns_same_displayed_until_claimed():
    _event, _d, st = _display_session()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r1 = c.post(
        "/api/v1/walkins/displays/next/",
        {"gate": "G1", "scanner_label": "S1"},
        format="json",
    )
    r2 = c.post(
        "/api/v1/walkins/displays/next/",
        {"gate": "G1", "scanner_label": "S1"},
        format="json",
    )
    assert r1.data["guest_id"] == r2.data["guest_id"]


def test_scanner_device_cannot_run_display():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post(
        "/api/v1/walkins/displays/next/",
        {"gate": "G1", "scanner_label": "S1"},
        format="json",
    )
    assert r.status_code == 403
