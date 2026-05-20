"""Device enrollment lifecycle.

Two-step issuance:
  1. Organizer creates a ScannerDevice row with `enrollment_code_hash` set.
     The raw `enrollment_code` is returned in the HTTP response exactly once.
  2. Device POSTs the raw code to /devices/enroll/; we hash + look it up,
     mint a durable `device_token`, hash it at rest, and clear the
     enrollment_code_hash so the code is single-use.
"""

from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.common.tokens import generate_token, hash_token
from apps.devices.models import ScannerDevice


@transaction.atomic
def create_device(
    *, organization, event, label: str, role: str, gate: str = ""
) -> tuple[ScannerDevice, str]:
    """Create an un-enrolled ScannerDevice + return the raw enrollment code."""
    enrollment_code = generate_token()
    device = ScannerDevice.objects.create(
        organization=organization,
        event=event,
        label=label,
        role=role,
        gate=gate,
        enrollment_code_hash=hash_token(enrollment_code),
    )
    return device, enrollment_code


@transaction.atomic
def complete_enrollment(*, enrollment_code: str) -> tuple[ScannerDevice, str]:
    """Exchange a raw enrollment code for a durable device_token.

    Single-use: clears enrollment_code_hash on success. 404 if the code
    is unknown, already exchanged, or the device has been revoked.
    """
    device = get_object_or_404(
        ScannerDevice,
        enrollment_code_hash=hash_token(enrollment_code),
        device_token_hash="",
        revoked_at__isnull=True,
    )
    device_token = generate_token()
    device.device_token_hash = hash_token(device_token)
    device.enrollment_code_hash = ""
    device.enrolled_at = timezone.now()
    device.save(
        update_fields=[
            "device_token_hash",
            "enrollment_code_hash",
            "enrolled_at",
            "updated_at",
        ]
    )
    return device, device_token


@transaction.atomic
def revoke_device(device: ScannerDevice) -> None:
    """Mark device revoked. Idempotent."""
    if device.revoked_at:
        return
    device.revoked_at = timezone.now()
    device.save(update_fields=["revoked_at", "updated_at"])
