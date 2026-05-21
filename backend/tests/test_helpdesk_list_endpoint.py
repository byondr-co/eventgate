"""GET /api/v1/orgs/<slug>/events/<event>/helpdesk/tickets/"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, user


def _make_ticket(org, event, action="checkin.help_desk_escalation", status="open"):
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d1",
        action=action,
        result="warning",
    )
    return HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status=status,
    )


def test_list_returns_open_tickets(env):
    c, org, event, _ = env
    _make_ticket(org, event)
    _make_ticket(org, event)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2


def test_list_filter_chip_resolved(env):
    c, org, event, _ = env
    _make_ticket(org, event, status="open")
    _make_ticket(org, event, status="resolved")
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/?status=resolved")
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0]["claim_status"] == "resolved"


def test_list_filter_open_or_claimed(env):
    c, org, event, _ = env
    _make_ticket(org, event, status="open")
    _make_ticket(org, event, status="claimed")
    _make_ticket(org, event, status="resolved")
    r = c.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/?status=open_or_claimed"
    )
    results = r.json()["results"]
    assert len(results) == 2
    assert all(t["claim_status"] in ("open", "claimed") for t in results)


def test_list_excludes_other_events(env):
    c, org, event, _ = env
    other = Event.objects.create(organization=org, name="Other", slug="other")
    _make_ticket(org, event)
    _make_ticket(org, other)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert len(r.json()["results"]) == 1


def test_list_anonymous_forbidden(env):
    _, org, event, _ = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert r.status_code in (401, 403)


def test_list_payload_shape(env):
    c, org, event, _ = env
    ticket = _make_ticket(org, event)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    row = r.json()["results"][0]
    assert row["id"] == ticket.id
    assert "audit_event" in row
    assert row["audit_event"]["action"] == "checkin.help_desk_escalation"
    assert "details_json" in row["audit_event"]
    assert row["claim_status"] == "open"


def test_list_etag_returns_304_on_match(env):
    c, org, event, _ = env
    _make_ticket(org, event)
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    etag = r1["ETag"]
    r2 = c.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/",
        HTTP_IF_NONE_MATCH=etag,
    )
    assert r2.status_code == 304
