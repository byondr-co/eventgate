from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz


class AuditEvent(models.Model):
    """Append-only audit row. write_audit() is the only sanctioned writer.

    DB-level enforcement: a BEFORE UPDATE OR DELETE trigger raises an
    exception (migration 0002). The app's write_audit() guard remains the
    primary call site; the trigger is defense in depth.
    """

    ACTOR_TYPES = (
        ("user", "User"),
        ("scanner_device", "Scanner device"),
        ("guest", "Guest"),
        ("system", "System"),
    )
    RESULTS = (("success", "Success"), ("warning", "Warning"), ("error", "Error"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.PROTECT, related_name="+"
    )
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    guest = models.ForeignKey(
        "guests.Guest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    occurred_at = models.DateTimeField(default=tz.now)
    actor_type = models.CharField(max_length=16, choices=ACTOR_TYPES)
    actor_id = models.CharField(max_length=64)
    action = models.CharField(max_length=64)  # e.g. checkin.success, walkin.claim
    result = models.CharField(max_length=8, choices=RESULTS)
    previous_status = models.CharField(max_length=24, blank=True)
    new_status = models.CharField(max_length=24, blank=True)
    gate = models.CharField(max_length=64, blank=True)
    scanner = models.CharField(max_length=64, blank=True)
    entry_token = models.CharField(max_length=128, blank=True)
    details_json = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes: ClassVar = [
            models.Index(fields=("event", "-occurred_at"), name="audit_event_time_idx"),
        ]
        ordering = ("-occurred_at",)

    def __str__(self) -> str:
        return f"{self.occurred_at:%Y-%m-%d %H:%M:%S} {self.action} ({self.result})"
