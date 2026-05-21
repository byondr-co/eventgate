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


@pytest.mark.django_db
def test_etag_changes_when_row_leaves_filtered_set(env):
    """When a ticket transitions out of a filter (e.g., open → resolved), the
    ETag for that filter must change so the client revalidates.

    Regression test for Plan F verification Bug A: ETag formula was
    max(updated_at) + max(id) + filter, which didn't change when a row
    leaving the filter happened to share max(updated_at) and max(id) with
    a remaining row.
    """
    c, org, event, _ = env
    t1 = _make_ticket(org, event, status="open")
    _make_ticket(org, event, status="open")
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/?status=open"
    r1 = c.get(url)
    etag_before = r1["ETag"]
    assert r1.status_code == 200
    assert len(r1.json()["results"]) == 2

    # Resolve t1 — it leaves the ?status=open filter.
    t1.claim_status = "resolved"
    t1.save()

    r2 = c.get(url)
    etag_after = r2["ETag"]
    assert r2.status_code == 200
    assert len(r2.json()["results"]) == 1
    # The ETag MUST differ — otherwise a client with the prior ETag would
    # be served 304 + the stale 2-row body.
    assert etag_before != etag_after, (
        f"ETag did not change when a row left the filter. "
        f"Before: {etag_before}, after: {etag_after}. "
        f"This means the polling client receives stale data."
    )

    # Verify the 304 round-trip works correctly with the NEW etag.
    r3 = c.get(url, HTTP_IF_NONE_MATCH=etag_after)
    assert r3.status_code == 304


@pytest.mark.django_db
def test_etag_includes_count_explicitly(env):
    """Ensure the ETag input includes count, so even when max(updated_at)
    and max(id) happen to match across two filtered sets, the hash differs.

    This tests the SAFETY PROPERTY directly, not just one observable consequence.
    """
    c, org, event, _ = env
    t1 = _make_ticket(org, event, status="open")
    t2 = _make_ticket(org, event, status="open")
    url_open = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/?status=open"
    r_with_two = c.get(url_open)
    etag_two = r_with_two["ETag"]

    # Manually force t1's updated_at to match t2's — simulates the
    # production race where rapid mutations land in the same microsecond.
    from apps.helpdesk.models import HelpDeskTicketState

    HelpDeskTicketState.objects.filter(id=t1.id).update(updated_at=t2.updated_at)

    # Remove t1 from the open filter without changing updated_at distribution.
    HelpDeskTicketState.objects.filter(id=t1.id).update(claim_status="resolved")

    r_with_one = c.get(url_open)
    etag_one = r_with_one["ETag"]
    assert etag_one != etag_two, (
        "ETag still collides after row removal — count is missing from the "
        "ETag input, server will incorrectly 304 polling clients."
    )
