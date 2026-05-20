from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz


class ScannerDevice(models.Model):
    """An enrolled scanner / walk-in display / help-desk device.

    Device tokens are SHA-256-at-rest. The raw value is returned exactly once
    at enrollment-completion time and never again. Mirrors the Plan B
    magic-link token pattern.
    """

    ROLES = (
        ("scanner", "Pre-reg scanner"),
        ("walkin_display", "Walk-in display"),
        ("helpdesk", "Help desk"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, related_name="+"
    )
    event = models.ForeignKey(
        "events.Event", on_delete=models.CASCADE, related_name="scanner_devices"
    )
    label = models.CharField(max_length=80)
    role = models.CharField(max_length=16, choices=ROLES)
    gate = models.CharField(max_length=64, blank=True)
    enrollment_code_hash = models.CharField(
        max_length=128,
        blank=True,
        help_text="SHA-256 of the one-time enrollment code. Cleared once exchanged.",
    )
    device_token_hash = models.CharField(
        max_length=128,
        blank=True,
        help_text="SHA-256 of the durable per-device token. Empty until enrollment completes.",
    )
    enrolled_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("event", "label", "role"),
                name="unique_device_label_per_event_role",
            ),
        ]
        indexes: ClassVar = [
            models.Index(
                fields=("event", "role", "revoked_at"),
                name="device_event_role_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.label} ({self.role})"


class EventPinSession(models.Model):
    """Receipt that a device has unlocked its event with the correct PIN.

    Short-lived (default 8h) bearer token; the raw token is returned once and
    hashed at rest. Sent as `Authorization: Bearer <raw>` on mutating
    scanner endpoints.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="pin_sessions")
    scanner_device = models.ForeignKey(
        ScannerDevice, on_delete=models.CASCADE, related_name="sessions"
    )
    session_token_hash = models.CharField(max_length=128)
    unlocked_at = models.DateTimeField(default=tz.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    unlocked_by_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes: ClassVar = [
            models.Index(
                fields=("scanner_device", "-unlocked_at"),
                name="pin_session_device_idx",
            ),
        ]
        ordering = ("-unlocked_at",)

    def __str__(self) -> str:
        return f"PinSession({self.scanner_device_id}) @ {self.unlocked_at:%Y-%m-%d %H:%M}"
