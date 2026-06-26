import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok-1",
        full_name="Ana",
        email="ana@x.com",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event, guest


def guest_url(org, event, guest):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/"


@pytest.mark.django_db
def test_guest_detail_get(setup):
    client, org, event, guest = setup
    resp = client.get(guest_url(org, event, guest))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Ana"
