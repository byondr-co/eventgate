"""Verify the 0002 backfill creates one state row per existing escalation."""

from __future__ import annotations

import importlib

import pytest

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_backfill_creates_state_for_existing_escalations():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    # Two escalations exist before backfill.
    write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d2",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    # One unrelated audit row that should NOT get a state.
    write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d1",
        action="checkin.success",
        result="success",
    )
    # Wipe any existing state (the migration ran when DB was set up; we want
    # to test the backfill function itself):
    HelpDeskTicketState.objects.all().delete()

    # Python import names beginning with a digit need importlib indirection.
    mod = importlib.import_module("apps.helpdesk.migrations.0002_backfill_existing_escalations")
    from django.apps import apps as django_apps

    mod.backfill(django_apps, None)

    assert HelpDeskTicketState.objects.count() == 2
    for state in HelpDeskTicketState.objects.all():
        assert state.claim_status == "open"
        assert state.audit_event.action == "checkin.help_desk_escalation"
