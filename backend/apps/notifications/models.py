from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone as tz

from apps.common.models import OrgScopedModel


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


class TelegramBinding(OrgScopedModel):
    """Joins a Telegram chat_id to a Guest row. Created on /start <guest_token>."""

    guest = models.OneToOneField(
        "guests.Guest", on_delete=models.CASCADE, related_name="telegram_binding"
    )
    chat_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=64, blank=True)
    bound_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = (models.Index(fields=["chat_id"]),)

    def save(self, *args, **kwargs):
        if not self.organization_id and self.guest_id:
            self.organization = self.guest.event.organization
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"TelegramBinding(chat_id={self.chat_id}, guest={self.guest_id})"
