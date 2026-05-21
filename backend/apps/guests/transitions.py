"""Single source of truth for Guest status moves.

Mirrors the MVP TokenService.validateTransition() table. Any code that mutates
entry_status or info_status MUST route through here so the transition table
stays authoritative.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.guests.models import Guest


class InvalidTransition(Exception):
    pass


# (guest_type, from_status) -> {allowed_to_status}
_ENTRY_TABLE: dict[tuple[str, str], set[str]] = {
    ("pre_registered", "registered_not_arrived"): {"checked_in", "manual_review"},
    ("walk_in", "displayed"): {"checked_in", "voided", "manual_review"},
    # Plan F: help-desk override authority (brief Appendix A row 8).
    ("pre_registered", "manual_review"): {"checked_in", "voided"},
    ("walk_in", "manual_review"): {"checked_in", "voided"},
}

# from_info_status -> {allowed_to_info_status}
_INFO_TABLE: dict[str, set[str]] = {
    "claimed_pending_info": {"info_completed", "manual_review"},
    # info_completed is terminal at MVP.
}


def can_transition_entry(guest: Guest, *, to: str) -> bool:
    return to in _ENTRY_TABLE.get((guest.guest_type, guest.entry_status), set())


def can_transition_info(guest: Guest, *, to: str) -> bool:
    return to in _INFO_TABLE.get(guest.info_status, set())


@transaction.atomic
def apply_entry_transition(guest: Guest, *, to: str, side_effects: dict | None = None) -> Guest:
    if not can_transition_entry(guest, to=to):
        raise InvalidTransition(
            f"Cannot transition {guest.guest_type} from {guest.entry_status} to {to}"
        )
    previous = guest.entry_status
    guest.entry_status = to
    if to == "checked_in":
        guest.checked_in_at = timezone.now()
    update_fields = {"entry_status", "checked_in_at", "updated_at"}
    if side_effects:
        for k, v in side_effects.items():
            setattr(guest, k, v)
        update_fields.update(side_effects.keys())
    guest.save(update_fields=list(update_fields))
    guest._previous_entry_status = previous  # type: ignore[attr-defined]
    return guest


@transaction.atomic
def apply_info_transition(guest: Guest, *, to: str) -> Guest:
    if not can_transition_info(guest, to=to):
        raise InvalidTransition(f"Cannot transition info_status from {guest.info_status} to {to}")
    previous = guest.info_status
    guest.info_status = to
    guest.save(update_fields=["info_status", "updated_at"])
    guest._previous_info_status = previous  # type: ignore[attr-defined]
    return guest
