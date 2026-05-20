from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.checkins.services import CheckinFailure, perform_checkin
from apps.devices.auth import SessionTokenAuthentication


class CheckinView(APIView):
    """POST /api/v1/checkins/  Authorization: Bearer <session_token>

    Body: {token, gate, scanner_label, client_idempotency_key, scanned_at?}
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth class enforces it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        if device.role != "scanner":
            return Response({"detail": "This device cannot check in pre-reg guests."}, status=403)
        token = (request.data.get("token") or "").strip()
        gate = (request.data.get("gate") or "").strip()
        scanner_label = (request.data.get("scanner_label") or "").strip()
        idem = (request.data.get("client_idempotency_key") or "").strip()
        if not token or not idem:
            return Response({"detail": "token and client_idempotency_key required."}, status=400)
        try:
            body, code = perform_checkin(
                device=device,
                token=token,
                gate=gate,
                scanner_label=scanner_label,
                client_idempotency_key=idem,
            )
        except CheckinFailure as exc:
            return Response(exc.body, status=exc.http_status)
        return Response(body, status=code)
