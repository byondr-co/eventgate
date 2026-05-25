from __future__ import annotations

from typing import ClassVar

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.devices.auth import DeviceTokenAuthentication
from apps.devices.models import ScannerDevice
from apps.devices.serializers import DeviceCreateSerializer, DeviceSerializer
from apps.devices.services import (
    WrongPin,
    complete_enrollment,
    create_device,
    revoke_device,
    unlock_with_pin,
)
from apps.devices.throttles import DeviceEnrollIPThrottle
from apps.events.models import Event


class OrgDeviceViewSet(viewsets.ViewSet):
    """List + create + revoke scanner devices.

    URL: /api/v1/orgs/<org_slug>/events/<event_slug>/devices/[<device_id>/]
    Owner / admin / manager only.
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def _event(self, request, event_slug: str) -> Event:
        return get_object_or_404(Event, organization=request.organization, slug=event_slug)

    def list(self, request, org_slug, event_slug):
        event = self._event(request, event_slug)
        qs = ScannerDevice.objects.filter(event=event).order_by("-created_at")
        return Response(DeviceSerializer(qs, many=True).data)

    def create(self, request, org_slug, event_slug):
        event = self._event(request, event_slug)
        ser = DeviceCreateSerializer(data=request.data, context={"event": event})
        ser.is_valid(raise_exception=True)
        device, enrollment_code = create_device(
            organization=request.organization,
            event=event,
            **ser.validated_data,
        )
        body = DeviceSerializer(device).data
        body["device_id"] = str(device.id)
        body["enrollment_code"] = enrollment_code
        return Response(body, status=status.HTTP_201_CREATED)

    def destroy(self, request, org_slug, event_slug, device_id):
        event = self._event(request, event_slug)
        device = get_object_or_404(ScannerDevice, id=device_id, event=event)
        revoke_device(device)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceEnrollView(APIView):
    """POST /api/v1/devices/enroll/  {"enrollment_code": "..."}
    -> {device_id, device_token, event_id, event_slug, org_slug, label, role}

    Anonymous. Single-use code; subsequent attempts 404.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []
    throttle_classes = (DeviceEnrollIPThrottle,)

    def post(self, request):
        code = (request.data.get("enrollment_code") or "").strip()
        if not code:
            return Response({"detail": "enrollment_code required"}, status=400)
        try:
            device, device_token = complete_enrollment(enrollment_code=code)
        except Http404:
            return Response({"detail": "Unknown or already-used enrollment code."}, status=404)
        return Response(
            {
                "device_id": str(device.id),
                "device_token": device_token,
                "event_id": str(device.event_id),
                "event_slug": device.event.slug,
                "org_slug": device.organization.slug,
                "label": device.label,
                "role": device.role,
            }
        )


class DeviceUnlockView(APIView):
    """POST /api/v1/devices/unlock/  Authorization: Device <raw>  {"pin": "..."}
    -> {session_token, expires_at, device_id, event_id, label, role}
    """

    authentication_classes = (DeviceTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth class enforces it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Device token required."}, status=401)
        pin = (request.data.get("pin") or "").strip()
        try:
            session, raw = unlock_with_pin(
                device=device,
                raw_pin=pin,
                ip=request.META.get("REMOTE_ADDR"),
            )
        except WrongPin as exc:
            return Response({"detail": str(exc)}, status=403)
        return Response(
            {
                "session_token": raw,
                "expires_at": session.expires_at,
                "device_id": str(device.id),
                "event_id": str(device.event_id),
                "label": device.label,
                "role": device.role,
            }
        )
