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
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="t1",
        full_name="Zara",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="t2",
        full_name="Ana",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


@pytest.mark.django_db
def test_guest_ordering_by_name(setup):
    client, org, event = setup
    resp = client.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/", {"ordering": "full_name"}
    )
    assert resp.status_code == 200
    names = [g["full_name"] for g in resp.json()["results"]]
    assert names == ["Ana", "Zara"]


@pytest.mark.django_db
def test_guest_ordering_by_name_desc(setup):
    """Descending ordering reverses alphabetical — confirms OrderingFilter is applied."""
    client, org, event = setup
    resp = client.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/", {"ordering": "-full_name"}
    )
    assert resp.status_code == 200
    names = [g["full_name"] for g in resp.json()["results"]]
    assert names == ["Zara", "Ana"]


@pytest.mark.django_db
def test_guest_default_ordering_no_param(setup):
    """Without ?ordering=, default -created_at applies (Ana created later, appears first)."""
    client, org, event = setup
    resp = client.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/")
    assert resp.status_code == 200
    names = [g["full_name"] for g in resp.json()["results"]]
    # Ana was created after Zara, so newest-first puts Ana first
    assert names == ["Ana", "Zara"]
