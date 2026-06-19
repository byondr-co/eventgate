from __future__ import annotations

import hashlib
import json
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.audit.services import write_audit
from apps.common.locks import advisory_xact_lock
from apps.events.models import RegistrationField
from apps.guests.models import Guest
from apps.guests.services import EventNotOpen, RegistrationError, register_guest
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission

PRESET_TARGETS = {"name", "email", "phone_or_chat"}


class GoogleFormBridgeError(Exception):
    """Raised when a Google Form submission cannot be accepted."""


def payload_hash(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def valid_field_keys(bridge: GoogleFormBridge) -> set[str]:
    event_keys = set(
        RegistrationField.objects.filter(event=bridge.event).values_list("field_key", flat=True)
    )
    return event_keys | PRESET_TARGETS


def map_google_fields(bridge: GoogleFormBridge, fields: dict[str, Any]) -> dict[str, str]:
    allowed = valid_field_keys(bridge)
    out: dict[str, str] = {}

    for label, target in (bridge.field_mapping or {}).items():
        if target not in allowed:
            raise GoogleFormBridgeError(f"Mapping target '{target}' is not valid for this event.")

        raw = fields.get(label, "")
        if isinstance(raw, list):
            value = " ".join(str(v).strip() for v in raw if str(v).strip())
        else:
            value = str(raw).strip()

        if value:
            out[target] = value

    return out


def record_seen_labels(bridge: GoogleFormBridge, fields: dict[str, Any]) -> None:
    incoming = {str(k) for k in fields if str(k).strip()}
    if not incoming:
        return
    merged = sorted(set(bridge.seen_labels or []) | incoming)
    if merged != (bridge.seen_labels or []):
        bridge.seen_labels = merged
        bridge.save(update_fields=["seen_labels", "updated_at"])


def _submission_time(raw: Any):
    if not raw or not isinstance(raw, str):
        return None

    parsed = parse_datetime(raw)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _audit_rejection(
    *,
    bridge: GoogleFormBridge,
    submission_id: str,
    digest: str,
    reason: str,
    submission: GoogleFormSubmission | None = None,
) -> None:
    write_audit(
        organization=bridge.organization,
        event=bridge.event,
        guest=submission.guest if submission else None,
        actor_type="integration",
        actor_id=str(bridge.id),
        action="integration.google_form_submission_rejected",
        result="error",
        details={
            "bridge_id": str(bridge.id),
            "submission_id": submission_id,
            "payload_hash": digest,
            "reason": reason,
        },
    )


def _update_existing_guest(guest: Guest, payload: dict[str, str]) -> list[str]:
    changed: list[str] = []

    if payload.get("name") and guest.full_name != payload["name"]:
        guest.full_name = payload["name"]
        changed.append("full_name")
    if payload.get("phone_or_chat") and guest.phone_or_chat != payload["phone_or_chat"]:
        guest.phone_or_chat = payload["phone_or_chat"]
        changed.append("phone_or_chat")

    current_custom_fields = guest.custom_fields or {}
    custom_updates = {
        key: value
        for key, value in payload.items()
        if key not in PRESET_TARGETS and value and current_custom_fields.get(key) != value
    }
    if custom_updates:
        guest.custom_fields = {**current_custom_fields, **custom_updates}
        changed.append("custom_fields")

    if changed:
        guest.save(update_fields=[*changed, "updated_at"])

    return changed


def _validation_detail(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        if hasattr(exc, "messages"):
            return "; ".join(str(message) for message in exc.messages)
        return str(exc)
    return str(exc)


def _save_submission_or_reject(
    submission: GoogleFormSubmission,
    *,
    update_fields: list[str],
) -> None:
    try:
        submission.save(update_fields=update_fields)
    except ValidationError as exc:
        raise GoogleFormBridgeError(_validation_detail(exc)) from exc


def _normalized_email(mapped: dict[str, str]) -> str:
    return str(mapped.get("email") or "").strip().lower()


@transaction.atomic
def process_google_form_submission(
    *,
    bridge: GoogleFormBridge,
    payload: dict[str, Any],
) -> dict[str, Any]:
    submission_id = str(payload.get("submission_id") or "").strip()
    if not submission_id:
        raise GoogleFormBridgeError("submission_id is required.")

    digest = payload_hash(payload)
    submitted_at = _submission_time(payload.get("submitted_at"))
    submission, created = GoogleFormSubmission.objects.get_or_create(
        bridge=bridge,
        submission_id=submission_id,
        defaults={
            "organization": bridge.organization,
            "event": bridge.event,
            "status": "rejected",
            "payload_hash": digest,
            "received_payload": payload,
            "submitted_at": submitted_at,
        },
    )
    if not created and submission.processed_at:
        if submission.payload_hash != digest:
            reason = "Submission replay payload does not match original payload."
            _audit_rejection(
                bridge=bridge,
                submission_id=submission_id,
                digest=digest,
                reason=reason,
                submission=submission,
            )
            return {"status": "rejected", "detail": reason}

        return {
            "status": submission.status,
            "guest_id": str(submission.guest_id) if submission.guest_id else None,
            "detail": submission.error,
        }

    try:
        fields = payload.get("fields")
        if not isinstance(fields, dict):
            raise GoogleFormBridgeError("fields must be an object.")

        record_seen_labels(bridge, fields)

        if not bridge.enabled:
            raise GoogleFormBridgeError("Bridge is disabled.")

        mapped = map_google_fields(bridge, fields)
        normalized_email = _normalized_email(mapped)
        if normalized_email:
            advisory_xact_lock(f"google-form-bridge:{bridge.event_id}:email:{normalized_email}")

        existing = (
            Guest.objects.filter(
                organization=bridge.organization,
                event=bridge.event,
                email__iexact=normalized_email,
            ).first()
            if normalized_email
            else None
        )

        if existing:
            if bridge.duplicate_policy == "reject_duplicates":
                raise GoogleFormBridgeError("Duplicate: email already registered for this event.")

            changed = _update_existing_guest(existing, mapped)
            status = "updated" if changed else "duplicate"
            action = (
                "integration.google_form_guest_updated"
                if changed
                else "integration.google_form_guest_duplicate"
            )
            submission.status = status
            submission.guest = existing
            submission.error = ""
            submission.payload_hash = digest
            submission.received_payload = payload
            submission.submitted_at = submitted_at
            submission.processed_at = timezone.now()
            _save_submission_or_reject(
                submission,
                update_fields=[
                    "status",
                    "guest",
                    "error",
                    "payload_hash",
                    "received_payload",
                    "submitted_at",
                    "processed_at",
                    "updated_at",
                ],
            )
            write_audit(
                organization=bridge.organization,
                event=bridge.event,
                guest=existing,
                actor_type="integration",
                actor_id=str(bridge.id),
                action=action,
                result="success",
                entry_token=existing.entry_token,
                details={
                    "bridge_id": str(bridge.id),
                    "submission_id": submission_id,
                    "payload_hash": digest,
                    "changed_fields": changed,
                    "duplicate_policy": bridge.duplicate_policy,
                },
            )
            bridge.mark_seen()
            return {"status": status, "guest_id": str(existing.id)}

        guest = register_guest(
            event=bridge.event,
            payload=mapped,
            source="google_form_bridge",
            queue_qr_email_on_commit=True,
        )
        submission.status = "accepted"
        submission.guest = guest
        submission.error = ""
        submission.payload_hash = digest
        submission.received_payload = payload
        submission.submitted_at = submitted_at
        submission.processed_at = timezone.now()
        _save_submission_or_reject(
            submission,
            update_fields=[
                "status",
                "guest",
                "error",
                "payload_hash",
                "received_payload",
                "submitted_at",
                "processed_at",
                "updated_at",
            ],
        )
        write_audit(
            organization=bridge.organization,
            event=bridge.event,
            guest=guest,
            actor_type="integration",
            actor_id=str(bridge.id),
            action="integration.google_form_guest_created",
            result="success",
            entry_token=guest.entry_token,
            details={
                "bridge_id": str(bridge.id),
                "submission_id": submission_id,
                "payload_hash": digest,
                "mapped_keys": sorted(mapped.keys()),
                "duplicate_policy": bridge.duplicate_policy,
            },
        )
        bridge.mark_seen()
        return {"status": "accepted", "guest_id": str(guest.id)}
    except (EventNotOpen, RegistrationError, GoogleFormBridgeError) as exc:
        reason = _validation_detail(exc)
        submission.status = "rejected"
        submission.guest = None
        submission.error = reason
        submission.payload_hash = digest
        submission.received_payload = payload
        submission.submitted_at = submitted_at
        submission.processed_at = timezone.now()
        submission.save(
            update_fields=[
                "status",
                "guest",
                "error",
                "payload_hash",
                "received_payload",
                "submitted_at",
                "processed_at",
                "updated_at",
            ]
        )
        _audit_rejection(
            bridge=bridge,
            submission_id=submission_id,
            digest=digest,
            reason=reason,
            submission=submission,
        )
        return {"status": "rejected", "detail": reason}
