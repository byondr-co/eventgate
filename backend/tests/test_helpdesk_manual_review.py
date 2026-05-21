"""POST /helpdesk/manual-review/<guest_id>/resolve/"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="X",
        entry_status="manual_review",
        entry_token="tx",
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, user, guest


def test_approve_checkin_transitions_guest(env):
    c, org, event, user, guest = env
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/helpdesk/manual-review/{guest.id}/resolve/"
    )
    r = c.post(url, data={"action": "approve_checkin", "notes": "verified"}, format="json")
    assert r.status_code == 200, r.content
    guest.refresh_from_db()
    assert guest.entry_status == "checked_in"
    assert guest.checked_in_at is not None
    audit = AuditEvent.objects.filter(action="helpdesk.manual_review_resolved").first()
    assert audit is not None
    assert audit.details_json["action"] == "approve_checkin"


def test_void_transitions_guest(env):
    c, org, event, user, guest = env
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/helpdesk/manual-review/{guest.id}/resolve/"
    )
    r = c.post(url, data={"action": "void", "notes": ""}, format="json")
    assert r.status_code == 200
    guest.refresh_from_db()
    assert guest.entry_status == "voided"


def test_rejects_unknown_action(env):
    c, org, event, _, guest = env
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/helpdesk/manual-review/{guest.id}/resolve/"
    )
    r = c.post(url, data={"action": "checked_in", "notes": ""}, format="json")
    assert r.status_code == 400


def test_rejects_non_manual_review_guest(env):
    c, org, event, _, _ = env
    other = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Y",
        entry_status="checked_in",
        entry_token="ty",
    )
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/helpdesk/manual-review/{other.id}/resolve/"
    )
    r = c.post(url, data={"action": "approve_checkin", "notes": ""}, format="json")
    assert r.status_code == 400
