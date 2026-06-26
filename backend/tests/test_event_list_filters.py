import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    Event.objects.create(organization=org, name="Alpha Gala", slug="alpha")
    Event.objects.create(organization=org, name="Beta Bash", slug="beta")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org


def url(org):
    return f"/api/v1/orgs/{org.slug}/events/"


@pytest.mark.django_db
def test_event_search_by_name(setup):
    client, org = setup
    resp = client.get(url(org), {"search": "alpha"})
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()["results"]]
    assert names == ["Alpha Gala"]


@pytest.mark.django_db
def test_event_ordering_by_name(setup):
    client, org = setup
    resp = client.get(url(org), {"ordering": "name"})
    names = [e["name"] for e in resp.json()["results"]]
    assert names == ["Alpha Gala", "Beta Bash"]
