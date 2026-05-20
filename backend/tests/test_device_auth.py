"""Direct unit tests for DeviceTokenAuthentication + SessionTokenAuthentication.

Uses an inline urlconf (this module's `urlpatterns`) via `pytest.mark.urls`
so we can hang two trivial protected views off it — one per auth class —
and probe each independently of the production endpoints.
"""

from datetime import timedelta

import pytest
from django.urls import path
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.devices.auth import DeviceTokenAuthentication, SessionTokenAuthentication
from apps.devices.models import EventPinSession
from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.orgs.models import Organization


class _DeviceProtected(APIView):
    authentication_classes = (DeviceTokenAuthentication,)
    permission_classes = ()

    def get(self, request):
        return Response({"device": str(request.scanner_device.id)})


class _SessionProtected(APIView):
    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = ()

    def get(self, request):
        return Response(
            {
                "device": str(request.scanner_device.id),
                "session": str(request.scanner_session.id),
            }
        )


urlpatterns = [
    path("device/", _DeviceProtected.as_view()),
    path("session/", _SessionProtected.as_view()),
]


pytestmark = [pytest.mark.django_db, pytest.mark.urls("tests.test_device_auth")]


def _setup():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, device_token = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    return d, device_token, session_token


def test_device_auth_accepts_valid_token():
    d, dt, _ = _setup()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.get("/device/")
    assert r.status_code == 200
    assert r.data["device"] == str(d.id)


def test_device_auth_rejects_bad_token():
    _setup()
    c = APIClient(HTTP_AUTHORIZATION="Device bogus")
    r = c.get("/device/")
    assert r.status_code == 401


def test_session_auth_accepts_unexpired_session():
    d, _, st = _setup()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.get("/session/")
    assert r.status_code == 200
    assert r.data["device"] == str(d.id)


def test_session_auth_rejects_expired():
    d, _, st = _setup()
    s = EventPinSession.objects.filter(scanner_device=d).first()
    assert s is not None
    s.expires_at = timezone.now() - timedelta(minutes=1)
    s.save()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.get("/session/")
    assert r.status_code == 401
