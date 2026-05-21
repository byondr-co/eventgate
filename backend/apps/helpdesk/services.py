"""Mutations on HelpDeskTicketState. Each mutation also emits an audit row
so the audit log narrates state transitions."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services import write_audit
from apps.guests.models import Guest
from apps.guests.transitions import InvalidTransition, apply_entry_transition
from apps.helpdesk.models import HelpDeskTicketState

VALID_RESOLUTIONS = {
    "approve_checkin",
    "resolved_with_note",
    "void",
    "escalated_to_manual_review",
}


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

    # Escalation has a side effect: transition the guest into manual_review.
    if action == "escalated_to_manual_review":
        _escalate_guest_to_manual_review(ticket=ticket, user=user, notes=notes)

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


def _escalate_guest_to_manual_review(*, ticket: HelpDeskTicketState, user, notes: str) -> None:
    """Side effect for action='escalated_to_manual_review'.

    Looks up the guest by ``ticket.audit_event.entry_token`` within the
    ticket's event. Transitions guest -> manual_review and emits a separate
    ``helpdesk.manual_review_escalated`` audit row so the guest's audit history
    explains why they're in manual_review.

    Raises ValueError on:
      - empty/missing entry_token on the audit row
      - no matching guest in the ticket's event
      - guest's current state doesn't permit manual_review transition
    """
    token = (ticket.audit_event.entry_token or "").strip()
    if not token:
        raise ValueError("Escalation requires an entry_token on the audit row")
    guest = Guest.objects.filter(entry_token=token, event=ticket.event).first()
    if not guest:
        raise ValueError(f"No guest with entry_token={token[:16]}… in this event")
    previous_status = guest.entry_status
    try:
        apply_entry_transition(guest, to="manual_review")
    except InvalidTransition as exc:
        raise ValueError(str(exc)) from exc
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        guest=guest,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.manual_review_escalated",
        result="success",
        previous_status=previous_status,
        new_status="manual_review",
        details={
            "ticket_id": ticket.id,
            "audit_event_id": str(ticket.audit_event_id),
            "notes": notes,
        },
    )
