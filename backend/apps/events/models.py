from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz

from apps.common.storage import public_media_storage


class Event(models.Model):
    """An event run by an Organization."""

    STATUSES = (
        ("draft", "Draft"),
        ("open", "Open"),
        ("live", "Live"),
        ("closed", "Closed"),
        ("archived", "Archived"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, related_name="events"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80)
    status = models.CharField(max_length=16, choices=STATUSES, default="draft")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Phnom_Penh")
    venue = models.CharField(max_length=255, blank=True)
    banner_image = models.ImageField(
        upload_to="event-banners/", storage=public_media_storage, null=True, blank=True
    )
    description = models.TextField(blank=True)
    registration_open = models.BooleanField(default=True)
    walkins_enabled = models.BooleanField(default=True)
    walkin_capacity = models.PositiveIntegerField(
        default=0,
        help_text="Hard cap on total walk-in guests (counting all non-voided). 0 means unlimited.",
    )
    event_pin_hash = models.CharField(max_length=128, blank=True)
    event_pin_rotated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("organization", "slug"), name="unique_event_slug_per_org"
            ),
        ]
        indexes: ClassVar = [models.Index(fields=("organization", "status"))]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.name


class RegistrationField(models.Model):
    """One field in an event's registration form."""

    FIELD_TYPES = (
        ("text", "Short text"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("textarea", "Long text"),
        ("select", "Select"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registration_fields")
    field_key = models.SlugField(max_length=40)
    label_en = models.CharField(max_length=200)
    label_km = models.CharField(max_length=200, blank=True)
    field_type = models.CharField(max_length=12, choices=FIELD_TYPES, default="text")
    required = models.BooleanField(default=False)
    options_json = models.JSONField(default=list, blank=True)
    order_index = models.PositiveIntegerField(default=0)
    is_preset = models.BooleanField(default=False, help_text="Preset fields cannot be deleted.")
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("event", "field_key"), name="unique_field_key_per_event"
            ),
        ]
        ordering = ("order_index", "field_key")

    def __str__(self) -> str:
        return f"{self.event.slug}.{self.field_key}"
