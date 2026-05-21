"""HelpDeskTicketState model — mutable side state for help-desk escalations."""

from __future__ import annotations

import pytest

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_create_state_from_audit_row():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    state = HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status="open",
    )
    assert state.id is not None
    assert state.claim_status == "open"
    assert state.audit_event_id == audit.id


@pytest.mark.django_db
def test_one_state_per_audit_row():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status="open"
    )
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        HelpDeskTicketState.objects.create(
            audit_event=audit, organization=org, event=event, claim_status="open"
        )


@pytest.mark.django_db
def test_default_claim_status_is_open():
    org = Organization.objects.create(name="A", slug="a")
    event = Event.objects.create(organization=org, name="D", slug="d")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    state = HelpDeskTicketState.objects.create(audit_event=audit, organization=org, event=event)
    assert state.claim_status == "open"
