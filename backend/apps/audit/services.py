"""Append-only audit writer.

write_audit() is the ONLY sanctioned path to create AuditEvent rows. A
BEFORE UPDATE OR DELETE trigger on audit_auditevent (migration audit.0002)
plus a REVOKE on the app role enforce append-only at the DB layer. This
helper remains the canonical write site so callers can attach the right
fields and so any future invariants live in one place.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.audit.models import AuditEvent

_VALID_RESULTS = {"success", "warning", "error"}


@transaction.atomic
def write_audit(
    *,
    organization,
    event=None,
    guest=None,
    actor_type: str,
    actor_id: str,
    action: str,
    result: str,
    previous_status: str = "",
    new_status: str = "",
    gate: str = "",
    scanner: str = "",
    entry_token: str = "",
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    if not action:
        raise ValueError("audit.action is required")
    if result not in _VALID_RESULTS:
        raise ValueError(f"audit.result must be one of {_VALID_RESULTS}")
    return AuditEvent.objects.create(
        organization=organization,
        event=event,
        guest=guest,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        result=result,
        previous_status=previous_status,
        new_status=new_status,
        gate=gate,
        scanner=scanner,
        entry_token=entry_token,
        details_json=details or {},
    )
