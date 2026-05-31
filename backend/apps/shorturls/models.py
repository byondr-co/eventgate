from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class ShortUrl(models.Model):
    """Short-code redirect target. Typically auto-created per Event for public registration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    short_code = models.CharField(max_length=12, unique=True, db_index=True)
    target_url = models.CharField(max_length=500)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="short_urls",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    visit_count = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"/r/{self.short_code} → {self.target_url}"
