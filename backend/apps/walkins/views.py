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
    claim_walkin,
    complete_walkin_info,
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
        guest, url = get_or_create_displayed(device=device, **ser.validated_data)
        return Response(
            WalkinNextResponseSerializer(
                {
                    "guest_id": guest.id,
                    "entry_token": guest.entry_token,
                    "claim_url": url,
                }
            ).data
        )


class WalkinClaimView(APIView):
    """POST /api/v1/e/<org>/<event>/claim/<token>/  (public)

    Transitions a displayed walk-in to checked_in + claimed_pending_info.
    Idempotent.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request, org_slug, event_slug, token):
        from apps.checkins.services import CheckinFailure

        try:
            guest = claim_walkin(org_slug=org_slug, event_slug=event_slug, token=token)
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
