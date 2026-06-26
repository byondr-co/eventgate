import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, EventSlugAlias
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    other = Event.objects.create(organization=org, name="Gala", slug="gala")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, user, event, other


def url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/"


@pytest.mark.django_db
def test_patch_rejects_slug_taken_by_other_event(setup):
    client, org, _user, event, _other = setup
    resp = client.patch(url(org, event), {"slug": "gala"}, format="json")
    assert resp.status_code == 400
    assert "slug" in resp.json()


@pytest.mark.django_db
def test_patch_rejects_slug_taken_by_alias(setup):
    client, org, _user, event, other = setup
    EventSlugAlias.objects.create(organization=org, event=other, slug="reserved")
    resp = client.patch(url(org, event), {"slug": "reserved"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_rejects_end_before_start(setup):
    client, org, _user, event, _other = setup
    resp = client.patch(
        url(org, event),
        {"starts_at": "2026-07-01T10:00:00Z", "ends_at": "2026-07-01T09:00:00Z"},
        format="json",
    )
    assert resp.status_code == 400
    assert "ends_at" in resp.json()
