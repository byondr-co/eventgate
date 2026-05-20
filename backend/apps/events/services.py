"""Event services: preset field seeding."""

from __future__ import annotations

from django.db import transaction

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
