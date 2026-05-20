import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _mint_displayed_walkin():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
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
    return org, event, r.data["entry_token"]


def test_claim_transitions_walkin_to_checked_in():
    org, event, token = _mint_displayed_walkin()
    anon = APIClient()
    r = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    assert r.status_code == 200
    g = Guest.objects.get(entry_token=token)
    assert g.entry_status == "checked_in"
    assert g.info_status == "claimed_pending_info"
    assert AuditEvent.objects.filter(action="walkin.claim").count() == 1


def test_claim_is_idempotent():
    org, event, token = _mint_displayed_walkin()
    anon = APIClient()
    r1 = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    r2 = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.data["guest_id"] == r2.data["guest_id"]
    # Audit row appears exactly once
    assert AuditEvent.objects.filter(action="walkin.claim").count() == 1


def test_claim_unknown_token_returns_404():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    anon = APIClient()
    r = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/bogus/")
    assert r.status_code == 404
