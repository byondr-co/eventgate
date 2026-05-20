"""Device enrollment lifecycle.

Two-step issuance:
  1. Organizer creates a ScannerDevice row with `enrollment_code_hash` set.
     The raw `enrollment_code` is returned in the HTTP response exactly once.
  2. Device POSTs the raw code to /devices/enroll/; we hash + look it up,
     mint a durable `device_token`, hash it at rest, and clear the
     enrollment_code_hash so the code is single-use.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.common.tokens import generate_token, hash_token
from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.services import check_event_pin

SESSION_TTL = timedelta(hours=8)


class WrongPin(Exception):
    pass


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


@transaction.atomic
def unlock_with_pin(
    *, device: ScannerDevice, raw_pin: str, ip: str | None = None
) -> tuple[EventPinSession, str]:
    """Validate the device's event PIN; mint a new EventPinSession.

    Raises WrongPin if the PIN doesn't match. Returns (session, raw_token);
    the raw token is what the device sends as `Authorization: Bearer <…>`.
    """
    if not check_event_pin(device.event, raw_pin):
        raise WrongPin("Incorrect event PIN.")
    raw_session = generate_token()
    expires = timezone.now() + SESSION_TTL
    session = EventPinSession.objects.create(
        event=device.event,
        scanner_device=device,
        session_token_hash=hash_token(raw_session),
        expires_at=expires,
        unlocked_by_ip=ip,
    )
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])
    return session, raw_session
