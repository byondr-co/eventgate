from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz


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
    registration_open = models.BooleanField(default=True)
    walkins_enabled = models.BooleanField(default=True)
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
