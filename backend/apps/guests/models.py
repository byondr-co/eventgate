from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import OrgScopedModel


class Guest(OrgScopedModel):
    """A guest of an event. May be pre-registered or walk-in.

    Honors brief Appendix A: separate entry_status and info_status,
    entry_token is the raw QR payload for pre-reg guests.
    """

    GUEST_TYPES = (("pre_registered", "Pre-registered"), ("walk_in", "Walk-in"))
    ENTRY_STATUSES = (
        ("registered_not_arrived", "Registered, not arrived"),
        ("checked_in", "Checked in"),
        ("displayed", "Walk-in displayed"),
        ("voided", "Voided"),
        ("manual_review", "Manual review"),
    )
    INFO_STATUSES = (
        ("claimed_pending_info", "Claimed, pending info"),
        ("info_completed", "Info completed"),
        ("manual_review", "Manual review"),
    )

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="guests")
    guest_type = models.CharField(max_length=16, choices=GUEST_TYPES)
    entry_token = models.CharField(max_length=128)
    entry_status = models.CharField(
        max_length=24, choices=ENTRY_STATUSES, default="registered_not_arrived"
    )
    info_status = models.CharField(max_length=24, choices=INFO_STATUSES, default="info_completed")
    full_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone_or_chat = models.CharField(max_length=64, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    source = models.CharField(max_length=32, blank=True)
    gate = models.CharField(max_length=64, blank=True)
    scanner = models.CharField(max_length=64, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=("event", "entry_token"), name="unique_token_per_event"),
            # At most one walk-in can be in `displayed` state per (event, gate, scanner)
            # at any moment. Mirrors the MVP "one displayed token per scope" rule.
            models.UniqueConstraint(
                fields=("event", "gate", "scanner"),
                condition=models.Q(entry_status="displayed", guest_type="walk_in"),
                name="one_displayed_walkin_per_scope",
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=("event", "entry_status")),
            models.Index(fields=("event", "email")),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.full_name or self.email or self.entry_token[:8]} @ {self.event.slug}"
