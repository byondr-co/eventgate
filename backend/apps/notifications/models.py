from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone as tz


class NotificationDispatch(models.Model):
    """Audit trail of outbound notifications (email, Telegram, etc.).

    One row per attempt. Status updated as the dispatch progresses.
    """

    CHANNELS = (("email", "Email"), ("telegram", "Telegram"), ("self_serve", "Self-serve"))
    STATUSES = (
        ("queued", "Queued"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("bounced", "Bounced"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, null=True, related_name="+"
    )
    event = models.ForeignKey(
        "events.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    guest = models.ForeignKey(
        "guests.Guest", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    channel = models.CharField(max_length=16, choices=CHANNELS)
    template = models.CharField(max_length=64)
    recipient = models.CharField(max_length=255)
    status = models.CharField(max_length=16, choices=STATUSES, default="queued")
    attempts = models.PositiveSmallIntegerField(default=0)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(default=tz.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.channel}:{self.template} -> {self.recipient} ({self.status})"
