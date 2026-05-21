"""POST claim / release / resolve endpoints for help-desk tickets."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status="open",
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, user, ticket


def test_claim_sets_status_and_assignee(env):
    c, org, event, user, ticket = env
    r = c.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/claim/")
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "claimed"
    assert ticket.assigned_to_id == user.id
    assert AuditEvent.objects.filter(action="helpdesk.ticket_claimed").count() == 1


def test_release_returns_to_open_and_clears_assignee(env):
    c, org, event, user, ticket = env
    ticket.claim_status = "claimed"
    ticket.assigned_to = user
    ticket.save()
    r = c.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/release/")
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "open"
    assert ticket.assigned_to_id is None


def test_resolve_with_action_and_notes(env):
    c, org, event, user, ticket = env
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/resolve/",
        data={"action": "approve_checkin", "notes": "Verified ID."},
        format="json",
    )
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "resolved"
    assert ticket.resolution_action == "approve_checkin"
    assert ticket.resolution_notes == "Verified ID."
    assert ticket.resolved_at is not None
    audit = AuditEvent.objects.filter(action="helpdesk.ticket_resolved").first()
    assert audit is not None
    assert audit.details_json["action"] == "approve_checkin"


def test_resolve_rejects_unknown_action(env):
    c, org, event, _, ticket = env
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/resolve/",
        data={"action": "delete_audit_history", "notes": ""},
        format="json",
    )
    assert r.status_code == 400


def test_actions_require_org_membership(env):
    _, org, event, _, ticket = env
    other = APIClient()
    r = other.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/claim/"
    )
    assert r.status_code in (401, 403, 404)


def test_resolve_escalates_to_manual_review(env):
    c, org, event, _, _ = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Z",
        entry_status="registered_not_arrived",
        entry_token="tok-escalate",
    )
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d2",
        action="checkin.help_desk_escalation",
        result="warning",
        entry_token="tok-escalate",
    )
    new_ticket = HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status="open",
    )
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}" f"/helpdesk/tickets/{new_ticket.id}/resolve/"
    )
    r = c.post(
        url,
        data={"action": "escalated_to_manual_review", "notes": "needs human eyes"},
        format="json",
    )
    assert r.status_code == 200, r.content
    new_ticket.refresh_from_db()
    guest.refresh_from_db()
    assert new_ticket.claim_status == "resolved"
    assert new_ticket.resolution_action == "escalated_to_manual_review"
    assert guest.entry_status == "manual_review"
    assert AuditEvent.objects.filter(action="helpdesk.ticket_resolved").count() == 1
    assert AuditEvent.objects.filter(action="helpdesk.manual_review_escalated").count() == 1


def test_resolve_escalation_rejects_when_guest_state_disallows(env):
    c, org, event, _, _ = env
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="W",
        entry_status="checked_in",  # invalid source for manual_review
        entry_token="tok-bad",
    )
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d3",
        action="checkin.help_desk_escalation",
        result="warning",
        entry_token="tok-bad",
    )
    bad_ticket = HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status="open",
    )
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}" f"/helpdesk/tickets/{bad_ticket.id}/resolve/"
    )
    r = c.post(
        url,
        data={"action": "escalated_to_manual_review", "notes": ""},
        format="json",
    )
    assert r.status_code == 400


def test_resolve_escalation_rejects_when_guest_not_found(env):
    c, org, event, _, ticket = env
    # The default fixture audit row has empty entry_token — no matching guest.
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}" f"/helpdesk/tickets/{ticket.id}/resolve/"
    r = c.post(
        url,
        data={"action": "escalated_to_manual_review", "notes": ""},
        format="json",
    )
    assert r.status_code == 400
