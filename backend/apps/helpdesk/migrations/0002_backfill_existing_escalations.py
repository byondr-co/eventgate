"""Backfill HelpDeskTicketState rows for any pre-existing
checkin.help_desk_escalation audit rows (Plan E verification left up to a few
such rows on staging; new dev DBs will have zero)."""

from __future__ import annotations

from django.db import migrations


def backfill(apps, schema_editor):
    AuditEvent = apps.get_model("audit", "AuditEvent")
    HelpDeskTicketState = apps.get_model("helpdesk", "HelpDeskTicketState")

    escalations = AuditEvent.objects.filter(action="checkin.help_desk_escalation")
    for audit in escalations.iterator():
        if HelpDeskTicketState.objects.filter(audit_event_id=audit.id).exists():
            continue
        HelpDeskTicketState.objects.create(
            audit_event_id=audit.id,
            organization_id=audit.organization_id,
            event_id=audit.event_id,
            claim_status="open",
        )


def reverse(apps, schema_editor):
    # Don't undelete state on rollback — operators may have resolved tickets.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("helpdesk", "0001_initial"),
        ("audit", "0002_append_only_trigger"),
    ]
    operations = [migrations.RunPython(backfill, reverse)]
