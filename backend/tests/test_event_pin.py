import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import check_event_pin, set_event_pin
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(django_user_model):
    user = django_user_model.objects.create(email="owner@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event, user


def test_set_pin_service_hashes_and_verifies(setup):
    _, _, event, _ = setup
    set_event_pin(event, "1234")
    event.refresh_from_db()
    assert event.event_pin_hash
    assert event.event_pin_hash != "1234"
    assert check_event_pin(event, "1234") is True
    assert check_event_pin(event, "wrong") is False


def test_set_pin_endpoint_owner_ok(setup):
    client, org, event, _ = setup
    r = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/",
        {"pin": "0420"},
        format="json",
    )
    assert r.status_code == 200
    event.refresh_from_db()
    assert check_event_pin(event, "0420")


def test_set_pin_min_length(setup):
    client, org, event, _ = setup
    r = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/",
        {"pin": "12"},
        format="json",
    )
    assert r.status_code == 400


def test_rotate_pin_clears_old(setup):
    client, org, event, _ = setup
    set_event_pin(event, "1111")
    r = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/rotate/",
        {"pin": "2222"},
        format="json",
    )
    assert r.status_code == 200
    event.refresh_from_db()
    assert check_event_pin(event, "2222") is True
    assert check_event_pin(event, "1111") is False


def test_set_pin_requires_admin_or_owner(setup, django_user_model):
    _, org, event, _ = setup
    staff = django_user_model.objects.create(email="staff@x.com")
    OrganizationMembership.objects.create(
        organization=org, user=staff, role="staff", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=staff)
    r = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/",
        {"pin": "9999"},
        format="json",
    )
    assert r.status_code == 403
