"""Event services: preset field seeding + event PIN management."""

from __future__ import annotations

import bcrypt
from django.db import transaction
from django.utils import timezone

from apps.events.models import Event, RegistrationField

PRESETS = (
    {
        "field_key": "name",
        "label_en": "Full name",
        "label_km": "ឈ្មោះពេញ",
        "field_type": "text",
        "required": True,
        "order_index": 0,
    },
    {
        "field_key": "email",
        "label_en": "Email",
        "label_km": "អ៊ីមែល",
        "field_type": "email",
        "required": True,
        "order_index": 1,
    },
    {
        "field_key": "phone_or_chat",
        "label_en": "Phone or Chat ID",
        "label_km": "លេខទូរស័ព្ទ ឬ Chat ID",
        "field_type": "phone",
        "required": True,
        "order_index": 2,
    },
)


@transaction.atomic
def seed_preset_fields(event: Event) -> None:
    """Create the standard 3 preset fields. Idempotent."""
    for preset in PRESETS:
        RegistrationField.objects.get_or_create(
            event=event,
            field_key=preset["field_key"],
            defaults={**preset, "is_preset": True},
        )


PIN_MIN_LENGTH = 4


class PinTooShort(ValueError):
    pass


def set_event_pin(event: Event, raw_pin: str) -> None:
    """Hash raw_pin with bcrypt and stamp event_pin_rotated_at.

    Raises PinTooShort if pin is shorter than PIN_MIN_LENGTH or empty.
    """
    if not raw_pin or len(raw_pin) < PIN_MIN_LENGTH:
        raise PinTooShort(f"PIN must be at least {PIN_MIN_LENGTH} characters.")
    hashed = bcrypt.hashpw(raw_pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    event.event_pin_hash = hashed
    event.event_pin_rotated_at = timezone.now()
    event.save(update_fields=["event_pin_hash", "event_pin_rotated_at", "updated_at"])


def check_event_pin(event: Event, raw_pin: str) -> bool:
    """Constant-time-ish bcrypt compare. False on empty or absent hash."""
    if not event.event_pin_hash or not raw_pin:
        return False
    try:
        return bcrypt.checkpw(raw_pin.encode("utf-8"), event.event_pin_hash.encode("utf-8"))
    except ValueError:
        return False
