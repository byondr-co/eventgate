"""DRF authentication classes for scanner devices.

Two classes mirror the two-step trust model:

  * DeviceTokenAuthentication — validates a long-lived per-device token.
    Used by enrollment-adjacent endpoints (PIN unlock).

  * SessionTokenAuthentication — validates a short-lived PIN-unlock receipt.
    Used by mutating scanner endpoints (check-in, walk-in display next).

Successful authentication populates `request.scanner_device`; the session
variant also populates `request.scanner_session`. There is no `User` row
behind these — DRF expects something falsy-on-anonymity, so we return a
tiny stand-in object.
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.common.tokens import hash_token
from apps.devices.models import EventPinSession, ScannerDevice


class _AnonymousDeviceUser:
    """Bare object DRF needs as `request.user` for permission machinery.

    The real principal is the device, exposed as `request.scanner_device`.
    """

    is_authenticated = True
    is_anonymous = False
    is_staff = False
    is_active = True

    def __init__(self, label: str = "device") -> None:
        self.label = label

    @property
    def pk(self) -> None:
        return None

    def __str__(self) -> str:
        return f"device:{self.label}"


def _extract(prefix: str, header_value: str) -> str | None:
    if not header_value:
        return None
    if not header_value.lower().startswith(prefix.lower() + " "):
        return None
    return header_value.split(" ", 1)[1].strip() or None


class DeviceTokenAuthentication(BaseAuthentication):
    """Authorization: Device <raw_device_token>"""

    keyword = "Device"

    def authenticate(self, request):
        raw = _extract(self.keyword, request.headers.get("Authorization", ""))
        if not raw:
            return None
        try:
            device = ScannerDevice.objects.select_related("event", "organization").get(
                device_token_hash=hash_token(raw),
                revoked_at__isnull=True,
            )
        except ScannerDevice.DoesNotExist as exc:
            raise AuthenticationFailed("Invalid device token.") from exc
        request.scanner_device = device  # type: ignore[attr-defined]
        return (_AnonymousDeviceUser(label=device.label), device)

    def authenticate_header(self, request):
        return self.keyword


class SessionTokenAuthentication(BaseAuthentication):
    """Authorization: Bearer <raw_session_token>"""

    keyword = "Bearer"

    def authenticate(self, request):
        raw = _extract(self.keyword, request.headers.get("Authorization", ""))
        if not raw:
            return None
        try:
            session = EventPinSession.objects.select_related(
                "scanner_device",
                "scanner_device__event",
                "scanner_device__organization",
            ).get(session_token_hash=hash_token(raw))
        except EventPinSession.DoesNotExist as exc:
            raise AuthenticationFailed("Invalid session.") from exc
        if session.expires_at and session.expires_at < timezone.now():
            raise AuthenticationFailed("Session expired.")
        if session.scanner_device.revoked_at:
            raise AuthenticationFailed("Device revoked.")
        request.scanner_device = session.scanner_device  # type: ignore[attr-defined]
        request.scanner_session = session  # type: ignore[attr-defined]
        return (_AnonymousDeviceUser(label=session.scanner_device.label), session)

    def authenticate_header(self, request):
        return self.keyword
