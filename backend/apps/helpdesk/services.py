"""Mutations on HelpDeskTicketState. Each mutation also emits an audit row
so the audit log narrates state transitions."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services import write_audit
from apps.helpdesk.models import HelpDeskTicketState

VALID_RESOLUTIONS = {"approve_checkin", "resolved_with_note", "void"}


@transaction.atomic
def claim_ticket(*, ticket: HelpDeskTicketState, user) -> HelpDeskTicketState:
    ticket.claim_status = "claimed"
    ticket.assigned_to = user
    ticket.claimed_at = timezone.now()
    ticket.save(update_fields=["claim_status", "assigned_to", "claimed_at", "updated_at"])
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_claimed",
        result="success",
        details={"ticket_id": ticket.id, "audit_event_id": str(ticket.audit_event_id)},
    )
    return ticket


@transaction.atomic
def release_ticket(*, ticket: HelpDeskTicketState, user) -> HelpDeskTicketState:
    ticket.claim_status = "open"
    ticket.assigned_to = None
    ticket.claimed_at = None
    ticket.save(update_fields=["claim_status", "assigned_to", "claimed_at", "updated_at"])
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_released",
        result="success",
        details={"ticket_id": ticket.id, "audit_event_id": str(ticket.audit_event_id)},
    )
    return ticket


@transaction.atomic
def resolve_ticket(
    *, ticket: HelpDeskTicketState, user, action: str, notes: str
) -> HelpDeskTicketState:
    if action not in VALID_RESOLUTIONS:
        raise ValueError(f"Unknown resolution action: {action}")
    ticket.claim_status = "resolved"
    ticket.resolution_action = action
    ticket.resolution_notes = notes
    ticket.resolved_at = timezone.now()
    if not ticket.assigned_to_id:
        ticket.assigned_to = user
        ticket.claimed_at = ticket.claimed_at or timezone.now()
    ticket.save()
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_resolved",
        result="success",
        details={
            "ticket_id": ticket.id,
            "audit_event_id": str(ticket.audit_event_id),
            "action": action,
            "notes": notes,
        },
    )
    return ticket
