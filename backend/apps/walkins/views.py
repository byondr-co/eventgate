from __future__ import annotations

from typing import ClassVar

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.devices.auth import SessionTokenAuthentication
from apps.walkins.serializers import (
    WalkinClaimResponseSerializer,
    WalkinNextRequestSerializer,
    WalkinNextResponseSerializer,
)
from apps.walkins.services import (
    WalkinCapacityFull,
    claim_walkin,
    complete_walkin_info,
    count_active_walkins,
    get_or_create_displayed,
)


class WalkinDisplayNextView(APIView):
    """POST /api/v1/walkins/displays/next/  (Bearer <session_token>)

    Used by the walk-in-display tablet to fetch the current QR for its
    (gate, scanner_label). Idempotent — returns the same displayed walk-in
    until it's claimed.
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth class enforces it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device or device.role != "walkin_display":
            return Response({"detail": "This device cannot run the walk-in display."}, status=403)
        ser = WalkinNextRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            guest, url = get_or_create_displayed(device=device, **ser.validated_data)
        except WalkinCapacityFull as exc:
            # 200 + full state: the tablet polls continuously, so a soft
            # state is friendlier than a 4xx that would trigger error UI.
            return Response(
                {
                    "status": "full",
                    "walkin_count": exc.count,
                    "walkin_capacity": exc.capacity,
                }
            )
        # Recount AFTER the mint so the tablet's counter reflects the just-issued slot.
        active = count_active_walkins(device.event)
        payload = WalkinNextResponseSerializer(
            {
                "guest_id": guest.id,
                "entry_token": guest.entry_token,
                "claim_url": url,
            }
        ).data
        # Augment the response with capacity counters. We add these alongside the
        # existing keys (rather than wrapping in a status: "ready" envelope) to
        # keep the success contract backwards-compatible.
        payload["status"] = "ready"
        payload["walkin_count"] = active
        payload["walkin_capacity"] = device.event.walkin_capacity
        return Response(payload)


class WalkinClaimView(APIView):
    """POST /api/v1/e/<org>/<event>/claim/<token>/  (public)

    Transitions a displayed walk-in to checked_in + claimed_pending_info.
    Idempotent.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request, org_slug, event_slug, token):
        from apps.checkins.services import CheckinFailure

        device_id = ""
        if isinstance(request.data, dict):
            device_id = str(request.data.get("device_id") or "")
        try:
            guest = claim_walkin(
                org_slug=org_slug, event_slug=event_slug, token=token, device_id=device_id
            )
        except CheckinFailure as exc:
            return Response(exc.body, status=exc.http_status)
        info_url = f"/e/{org_slug}/{event_slug}/info/{token}/"
        return Response(
            WalkinClaimResponseSerializer(
                {
                    "guest_id": guest.id,
                    "event_slug": event_slug,
                    "org_slug": org_slug,
                    "info_form_url": info_url,
                }
            ).data,
            status=status.HTTP_200_OK,
        )


class WalkinInfoView(APIView):
    """POST /api/v1/e/<org>/<event>/info/<token>/  (public)

    Submits the inside-hall info form. First-write-wins.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request, org_slug, event_slug, token):
        try:
            guest = complete_walkin_info(
                org_slug=org_slug,
                event_slug=event_slug,
                token=token,
                payload=request.data,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"guest_id": str(guest.id), "info_status": guest.info_status})
