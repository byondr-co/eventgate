"""Pre-registered guest check-in.

The hot path. Order of operations (per brief §5 token validation flow):
  1. Idempotency replay short-circuit.
  2. Find the guest. If missing → audit + 404.
  3. Take pg_advisory_xact_lock to serialize concurrent scans of the same token.
  4. Re-read the guest under lock, run the transition validator.
     - InvalidTransition → 409 + warning audit "checkin.duplicate".
     - Success         → stamp gate/scanner + success audit.
  5. Update device.last_seen_at.
  6. Remember the success payload in Redis for 24h replay protection.

The audit writes for failure paths are emitted OUTSIDE the outer transaction
so a CheckinFailure raise doesn't roll them back along with the guest update.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.analytics.services import schedule_metric_increment
from apps.audit.services import write_audit
from apps.common.idempotency import already_seen, remember
from apps.common.locks import advisory_xact_lock
from apps.devices.models import ScannerDevice
from apps.events.live_publish import schedule_event_changed
from apps.guests.models import Guest
from apps.guests.transitions import InvalidTransition, apply_entry_transition


class CheckinFailure(Exception):
    """Carrier for a non-200 response body + HTTP status."""

    def __init__(self, body: dict[str, Any], http_status: int) -> None:
        super().__init__(body.get("detail", "checkin failed"))
        self.body = body
        self.http_status = http_status


def _serialize_guest(g: Guest) -> dict[str, Any]:
    return {
        "id": str(g.id),
        "full_name": g.full_name,
        "email": g.email,
        "guest_type": g.guest_type,
        "entry_status": g.entry_status,
        "info_status": g.info_status,
        "gate": g.gate,
        "scanner": g.scanner,
        "checked_in_at": g.checked_in_at.isoformat() if g.checked_in_at else None,
    }


def perform_checkin(
    *,
    device: ScannerDevice,
    token: str,
    gate: str,
    scanner_label: str,
    client_idempotency_key: str,
) -> tuple[dict[str, Any], int]:
    cached = already_seen(client_idempotency_key, scope="checkins")
    if cached is not False:
        return cached, 200

    try:
        guest = Guest.objects.get(event=device.event, entry_token=token)
    except Guest.DoesNotExist as exc:
        write_audit(
            organization=device.organization,
            event=device.event,
            actor_type="scanner_device",
            actor_id=str(device.id),
            action="checkin.token_not_found",
            result="error",
            gate=gate,
            scanner=scanner_label,
            entry_token=token[:32],
        )
        raise CheckinFailure(
            {"status": "invalid", "detail": "Token not recognised for this event."},
            404,
        ) from exc

    duplicate = False
    with transaction.atomic():
        advisory_xact_lock(f"checkin:{token}")
        guest.refresh_from_db()
        try:
            apply_entry_transition(guest, to="checked_in")
        except InvalidTransition:
            duplicate = True
        else:
            guest.gate = gate
            guest.scanner = scanner_label
            guest.save(update_fields=["gate", "scanner", "updated_at"])
            write_audit(
                organization=device.organization,
                event=device.event,
                guest=guest,
                actor_type="scanner_device",
                actor_id=str(device.id),
                action="checkin.success",
                result="success",
                previous_status="registered_not_arrived",
                new_status="checked_in",
                gate=gate,
                scanner=scanner_label,
                entry_token=token[:32],
            )
            schedule_metric_increment(
                organization_id=device.organization_id,
                event_id=device.event_id,
                counter="checkins",
                gate=gate,
                scanner=scanner_label,
            )
            schedule_event_changed(
                event_id=device.event_id,
                reason="checkin.success",
                keys=("stats", "audit", "guests_count"),
            )

    if duplicate:
        write_audit(
            organization=device.organization,
            event=device.event,
            guest=guest,
            actor_type="scanner_device",
            actor_id=str(device.id),
            action="checkin.duplicate",
            result="warning",
            previous_status=guest.entry_status,
            new_status=guest.entry_status,
            gate=gate,
            scanner=scanner_label,
            entry_token=token[:32],
        )
        # If the existing check-in was performed by a different device/gate,
        # emit an additional checkin.conflict row. Plan F's help-desk inbox
        # filters on this action to surface offline-vs-online race conditions.
        if (guest.gate or "") != (gate or "") or (guest.scanner or "") != (scanner_label or ""):
            write_audit(
                organization=device.organization,
                event=device.event,
                guest=guest,
                actor_type="scanner_device",
                actor_id=str(device.id),
                action="checkin.conflict",
                result="warning",
                previous_status=guest.entry_status,
                new_status=guest.entry_status,
                gate=gate,
                scanner=scanner_label,
                entry_token=token[:32],
                details={
                    "original_gate": guest.gate,
                    "original_scanner": guest.scanner,
                    "original_checked_in_at": (
                        guest.checked_in_at.isoformat() if guest.checked_in_at else None
                    ),
                },
            )
            schedule_metric_increment(
                organization_id=device.organization_id,
                event_id=device.event_id,
                counter="conflicts",
                gate=gate,
                scanner=scanner_label,
            )
            schedule_event_changed(
                event_id=device.event_id,
                reason="checkin.conflict",
                keys=("stats", "audit", "helpdesk"),
            )
        schedule_metric_increment(
            organization_id=device.organization_id,
            event_id=device.event_id,
            counter="duplicates",
            gate=gate,
            scanner=scanner_label,
        )
        schedule_event_changed(
            event_id=device.event_id,
            reason="checkin.duplicate",
            keys=("stats", "audit", "helpdesk"),
        )
        raise CheckinFailure(
            {
                "status": "duplicate",
                "guest": _serialize_guest(guest),
                "detail": f"Already in state {guest.entry_status}.",
            },
            409,
        )

    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])

    body = {"status": "success", "guest": _serialize_guest(guest)}
    remember(client_idempotency_key, scope="checkins", value=body)
    return body, 200
