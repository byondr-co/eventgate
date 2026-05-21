"""Scanner-role endpoints — currently just escalation.

Each endpoint is gated by SessionTokenAuthentication and validates that the
device's role permits the action. Endpoints here are intended to be called
*by* the scanner PWA, not by the organizer dashboard.
"""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.devices.auth import SessionTokenAuthentication


class EscalationView(APIView):
    """POST /api/v1/scanner/escalations/

    Body:
        {
            "token": "<raw entry_token>",
            "reason": "scanner_offline_conflict" | "manual",
            "original_payload": {…},   ← what the scanner tried to write
            "conflict_payload": {…}    ← what the server reported instead
        }

    Writes a single AuditEvent (action=checkin.help_desk_escalation) which
    Plan F's help-desk inbox will read.
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth class enforces it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"detail": "token is required."}, status=400)
        reason = (request.data.get("reason") or "manual").strip()
        original_payload = request.data.get("original_payload") or {}
        conflict_payload = request.data.get("conflict_payload") or {}

        audit = write_audit(
            organization=device.organization,
            event=device.event,
            actor_type="scanner_device",
            actor_id=str(device.id),
            action="checkin.help_desk_escalation",
            result="warning",
            entry_token=token[:128],
            details={
                "reason": reason,
                "original_payload": original_payload,
                "conflict_payload": conflict_payload,
                "device_label": device.label,
            },
        )
        return Response({"escalation_id": str(audit.id)}, status=201)
