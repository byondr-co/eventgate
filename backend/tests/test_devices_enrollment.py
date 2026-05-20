import pytest
from rest_framework.test import APIClient

from apps.devices.models import ScannerDevice
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(django_user_model):
    user = django_user_model.objects.create(email="o@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_create_device_returns_one_time_enrollment_code(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "Gate 1 Lane A", "role": "scanner", "gate": "Gate 1"},
        format="json",
    )
    assert r.status_code == 201
    assert "enrollment_code" in r.data
    assert len(r.data["enrollment_code"]) > 20  # secure token-like length
    assert "device_token" not in r.data
    d = ScannerDevice.objects.get(id=r.data["device_id"])
    assert d.enrollment_code_hash
    assert not d.device_token_hash
    assert d.enrolled_at is None


def test_enroll_exchanges_code_for_device_token(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"},
        format="json",
    )
    code = r.data["enrollment_code"]
    anon = APIClient()
    r2 = anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    assert r2.status_code == 200
    assert "device_token" in r2.data
    assert "device_id" in r2.data
    d = ScannerDevice.objects.get(id=r2.data["device_id"])
    assert d.device_token_hash
    assert d.enrollment_code_hash == ""  # cleared after use
    assert d.enrolled_at is not None


def test_enroll_with_invalid_code_returns_404(setup):
    anon = APIClient()
    r = anon.post("/api/v1/devices/enroll/", {"enrollment_code": "nope"}, format="json")
    assert r.status_code == 404


def test_enroll_with_already_used_code_fails(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"},
        format="json",
    )
    code = r.data["enrollment_code"]
    anon = APIClient()
    anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    r2 = anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    assert r2.status_code == 404


def test_revoke_device(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"},
        format="json",
    )
    dev_id = r.data["device_id"]
    r2 = c.delete(f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/{dev_id}/")
    assert r2.status_code == 204
    d = ScannerDevice.objects.get(id=dev_id)
    assert d.revoked_at is not None


def test_list_devices(setup):
    c, org, event = setup
    c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"},
        format="json",
    )
    c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G2", "role": "walkin_display"},
        format="json",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/")
    assert r.status_code == 200
    assert len(r.data) == 2
    for row in r.data:
        assert "device_token" not in row
        assert "enrollment_code" not in row
