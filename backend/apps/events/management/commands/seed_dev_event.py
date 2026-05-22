"""Seed a dev event with 2 pre-registered guests for local verification.

Idempotent — re-running this command yields the same state. Designed to
support the cross-device verification methodology (Plan F 0e) and Plan G's
end-to-end verification checklist.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.guests.services import register_guest
from apps.orgs.models import Organization

DEV_ORG_SLUG = "dev-acme"
DEV_EVENT_SLUG = "dev-conf"
DEV_GUESTS = (
    {"name": "Alice Demo", "email": "alice@dev.eventgate.local", "phone_or_chat": "+1-555-0101"},
    {"name": "Bob Demo", "email": "bob@dev.eventgate.local", "phone_or_chat": "+1-555-0102"},
)


class Command(BaseCommand):
    help = "Seed a dev org + event + 2 pre-registered guests for verification flows."

    def handle(self, *args, **options) -> None:
        org, _ = Organization.objects.get_or_create(
            slug=DEV_ORG_SLUG, defaults={"name": "Dev Acme"}
        )
        event, created = Event.objects.get_or_create(
            organization=org,
            slug=DEV_EVENT_SLUG,
            defaults={
                "name": "Dev Conference",
                "registration_open": True,
                "walkins_enabled": True,
            },
        )
        if created:
            seed_preset_fields(event)
        elif not event.registration_fields.exists():
            # Defensive: seed presets if a partial create left them out.
            seed_preset_fields(event)

        guests: list[Guest] = []
        for payload in DEV_GUESTS:
            existing = Guest.objects.filter(event=event, email=payload["email"]).first()
            if existing:
                guests.append(existing)
                continue
            guests.append(register_guest(event=event, payload=payload, source="dev_seed"))

        self.stdout.write(self.style.SUCCESS(f"Seeded {DEV_ORG_SLUG}/{DEV_EVENT_SLUG}"))
        for g in guests:
            self.stdout.write(f"  Guest: {g.full_name} <{g.email}>  entry_token: {g.entry_token}")
        self.stdout.write(
            f"  walkins_enabled: {event.walkins_enabled} | registration_open: {event.registration_open}"
        )
