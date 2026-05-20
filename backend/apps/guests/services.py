"""Guest registration service."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.tokens import generate_token
from apps.events.models import Event
from apps.guests.models import Guest

PRESET_FIELDS = ("name", "email", "phone_or_chat")


class RegistrationError(Exception):
    pass


class EventNotOpen(RegistrationError):
    pass


@transaction.atomic
def register_guest(*, event: Event, payload: dict[str, Any], source: str = "public_form") -> Guest:
    if not event.registration_open:
        raise EventNotOpen("Registration is closed for this event.")

    required_keys = list(
        event.registration_fields.filter(required=True).values_list("field_key", flat=True)
    )
    missing = [k for k in required_keys if not payload.get(k)]
    if missing:
        raise RegistrationError(f"Missing required: {', '.join(missing)}")

    preset = {k: payload[k] for k in PRESET_FIELDS if k in payload}
    custom = {k: v for k, v in payload.items() if k not in PRESET_FIELDS}

    known_custom_keys = set(
        event.registration_fields.exclude(field_key__in=PRESET_FIELDS).values_list(
            "field_key", flat=True
        )
    )
    custom = {k: v for k, v in custom.items() if k in known_custom_keys}

    token = generate_token()
    guest = Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token=token,
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name=preset.get("name", ""),
        email=preset.get("email", ""),
        phone_or_chat=preset.get("phone_or_chat", ""),
        custom_fields=custom,
        source=source,
    )

    from apps.guests.tasks import send_qr_email_task

    send_qr_email_task.delay(guest_id=str(guest.id))

    return guest
