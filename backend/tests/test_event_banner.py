from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def test_patch_description_persists():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/",
        {"description": "Doors at 7pm."},
        format="json",
    )
    assert r.status_code == 200, r.content
    event.refresh_from_db()
    assert event.description == "Doors at 7pm."


def test_public_detail_exposes_description_and_null_banner():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    Event.objects.create(organization=org, name="E", slug="e", description="Welcome")
    c = APIClient()
    r = c.get(f"/api/v1/e/{org.slug}/e/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["description"] == "Welcome"
    assert body["banner_image"] is None
