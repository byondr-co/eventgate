"""Walk-in lifecycle services.

Three operations cover the brief's walk-in flow:

  get_or_create_displayed — scanner-authenticated (walkin_display role).
    Returns the current `displayed` walk-in for (event, gate, scanner_label)
    or mints a new one and persists it BEFORE returning. Concurrent display
    refreshes serialize on advisory_xact_lock keyed by the (event, gate,
    scanner) tuple; the partial unique index on guests is a belt-and-
    suspenders backstop.

  claim_walkin — public. Guest opens the URL embedded in the displayed QR.
    Transitions displayed → checked_in + claimed_pending_info. Idempotent:
    claiming twice returns the same checked_in record without raising.

  complete_walkin_info — public. Submits the inside-the-hall info form.
    Transitions claimed_pending_info → info_completed. Idempotent: first
    write wins; subsequent submissions return the existing record.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.audit.services import write_audit
from apps.common.locks import advisory_xact_lock
from apps.common.tokens import generate_token
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import (
    InvalidTransition,
    apply_entry_transition,
    apply_info_transition,
)


def build_claim_url(*, event: Event, token: str) -> str:
    """Compose the URL that the displayed walk-in QR encodes."""
    base = getattr(settings, "PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/e/{event.organization.slug}/{event.slug}/claim/{token}/"


@transaction.atomic
def get_or_create_displayed(*, device, gate: str, scanner_label: str) -> tuple[Guest, str]:
    """Idempotent-per-scope walk-in mint.

    Locks on (event, gate, scanner_label) so racing display refreshes don't
    create two simultaneous walk-ins for the same physical lane.
    """
    advisory_xact_lock(f"walkin-display:{device.event_id}:{gate}:{scanner_label}")
    existing = (
        Guest.objects.filter(
            event=device.event,
            guest_type="walk_in",
            entry_status="displayed",
            gate=gate,
            scanner=scanner_label,
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing, build_claim_url(event=device.event, token=existing.entry_token)

    token = generate_token()
    guest = Guest.objects.create(
        organization=device.organization,
        event=device.event,
        guest_type="walk_in",
        entry_token=token,
        entry_status="displayed",
        info_status="info_completed",  # default; reset on claim
        gate=gate,
        scanner=scanner_label,
        source="walk_in_display",
    )
    write_audit(
        organization=device.organization,
        event=device.event,
        guest=guest,
        actor_type="scanner_device",
        actor_id=str(device.id),
        action="walkin.display.create",
        result="success",
        previous_status="",
        new_status="displayed",
        gate=gate,
        scanner=scanner_label,
        entry_token=token[:32],
    )
    return guest, build_claim_url(event=device.event, token=token)


@transaction.atomic
def claim_walkin(*, org_slug: str, event_slug: str, token: str) -> Guest:
    """Transition a displayed walk-in into checked_in + claimed_pending_info.

    Idempotent: a guest already in `checked_in` is returned as-is, with no
    extra audit row. Unknown / wrong-event tokens raise Http404.
    """
    guest = get_object_or_404(
        Guest,
        event__organization__slug=org_slug,
        event__slug=event_slug,
        entry_token=token,
        guest_type="walk_in",
    )
    advisory_xact_lock(f"walkin-claim:{token}")
    guest.refresh_from_db()
    if guest.entry_status == "checked_in":
        return guest

    try:
        apply_entry_transition(
            guest,
            to="checked_in",
            side_effects={"info_status": "claimed_pending_info"},
        )
    except InvalidTransition as exc:
        # voided / manual_review / other terminal states
        from apps.checkins.services import CheckinFailure

        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="guest",
            actor_id=str(guest.id),
            action="walkin.claim.invalid",
            result="error",
            previous_status=guest.entry_status,
            new_status=guest.entry_status,
            entry_token=token[:32],
        )
        raise CheckinFailure({"detail": str(exc)}, 409) from exc

    write_audit(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        actor_type="guest",
        actor_id=str(guest.id),
        action="walkin.claim",
        result="success",
        previous_status="displayed",
        new_status="checked_in",
        entry_token=token[:32],
    )
    return guest


@transaction.atomic
def complete_walkin_info(
    *, org_slug: str, event_slug: str, token: str, payload: dict[str, Any]
) -> Guest:
    """Inside-hall info form submission. First-write-wins semantics."""
    guest = get_object_or_404(
        Guest,
        event__organization__slug=org_slug,
        event__slug=event_slug,
        entry_token=token,
        guest_type="walk_in",
    )
    if guest.info_status == "info_completed":
        return guest  # idempotent — preserve the original submission

    required = list(
        guest.event.registration_fields.filter(required=True).values_list("field_key", flat=True)
    )
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise ValueError(f"Missing required: {', '.join(missing)}")

    from apps.guests.services import PRESET_FIELDS  # avoid module-load cycle

    preset = {k: payload[k] for k in PRESET_FIELDS if k in payload}
    known_custom_keys = set(
        guest.event.registration_fields.exclude(field_key__in=PRESET_FIELDS).values_list(
            "field_key", flat=True
        )
    )
    custom = {k: v for k, v in payload.items() if k in known_custom_keys}

    guest.full_name = preset.get("name", guest.full_name)
    guest.email = preset.get("email", guest.email)
    guest.phone_or_chat = preset.get("phone_or_chat", guest.phone_or_chat)
    guest.custom_fields = {**guest.custom_fields, **custom}
    guest.save(
        update_fields=[
            "full_name",
            "email",
            "phone_or_chat",
            "custom_fields",
            "updated_at",
        ]
    )
    apply_info_transition(guest, to="info_completed")
    write_audit(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        actor_type="guest",
        actor_id=str(guest.id),
        action="walkin.info_completed",
        result="success",
        previous_status="claimed_pending_info",
        new_status="info_completed",
        entry_token=token[:32],
    )
    return guest
