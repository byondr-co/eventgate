import pytest
from rest_framework.test import APIClient

from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import seed_preset_fields, set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _claimed_walkin():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    seed_preset_fields(event)
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post(
        "/api/v1/walkins/displays/next/",
        {"gate": "G", "scanner_label": "S"},
        format="json",
    )
    token = r.data["entry_token"]
    anon = APIClient()
    anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    return org, event, token


def test_info_form_completes_and_persists_preset_and_custom():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    r = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob", "email": "b@x.com", "phone_or_chat": "+123"},
        format="json",
    )
    assert r.status_code == 200
    g = Guest.objects.get(entry_token=token)
    assert g.full_name == "Bob"
    assert g.email == "b@x.com"
    assert g.info_status == "info_completed"


def test_info_form_missing_required_returns_400():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    r = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob"},
        format="json",
    )
    assert r.status_code == 400


def test_info_form_idempotent_after_completion():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob", "email": "b@x.com", "phone_or_chat": "+1"},
        format="json",
    )
    r2 = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob2", "email": "b2@x.com", "phone_or_chat": "+2"},
        format="json",
    )
    assert r2.status_code == 200
    g = Guest.objects.get(entry_token=token)
    # First write wins — second call returns the existing record unchanged.
    assert g.full_name == "Bob"
