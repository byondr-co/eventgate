"""Mutable side state for help-desk escalations.

The immutable signal lives in apps.audit.AuditEvent rows with
action="checkin.help_desk_escalation". This table layers the mutable bits
(claim status, assignee, resolution) on top, keyed 1:1 by audit_event_id.

Append-only audit constraint is preserved: state transitions on this table
emit *additional* AuditEvent rows (e.g. helpdesk.ticket_claimed,
helpdesk.ticket_resolved) so the audit narrative remains complete.
"""

from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone as tz


class HelpDeskTicketState(models.Model):
    CLAIM_STATUSES = (
        ("open", "Open"),
        ("claimed", "Claimed"),
        ("resolved", "Resolved"),
    )
    RESOLUTION_ACTIONS = (
        ("approve_checkin", "Approve check-in"),
        ("resolved_with_note", "Resolved with note"),
        ("void", "Void"),
    )

    audit_event = models.OneToOneField(
        "audit.AuditEvent",
        on_delete=models.PROTECT,
        related_name="helpdesk_state",
    )
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.PROTECT, related_name="+"
    )
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="+")
    claim_status = models.CharField(max_length=16, choices=CLAIM_STATUSES, default="open")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_action = models.CharField(max_length=24, choices=RESOLUTION_ACTIONS, blank=True)
    resolution_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes: ClassVar = [
            models.Index(fields=("event", "claim_status", "-created_at"), name="hdts_event_status"),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Ticket(audit={self.audit_event_id}, status={self.claim_status})"
