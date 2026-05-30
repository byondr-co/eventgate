import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.orgs.models import Organization, OrganizationMembership
from apps.orgs.serializers import OrganizationSerializer

pytestmark = pytest.mark.django_db

User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(
        user=owner,
        organization=org,
        role="owner",
    )
    return org


def test_owner_can_patch_org_name():
    user = _make_user("owner@x.com")
    org = _make_org("Original Name", owner=user)
    client = APIClient()
    client.force_authenticate(user=user)
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": "New Name"}, format="json")
    assert r.status_code == 200, r.content
    org.refresh_from_db()
    assert org.name == "New Name"


def test_patch_org_slug_is_ignored():
    user = _make_user("owner2@x.com")
    org = _make_org("Slug Test Org", owner=user)
    original_slug = org.slug
    client = APIClient()
    client.force_authenticate(user=user)
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"slug": "hacked"}, format="json")
    assert r.status_code == 200, r.content
    org.refresh_from_db()
    assert org.slug == original_slug


def test_non_owner_cannot_patch_org_name():
    owner = _make_user("o@x.com")
    org = _make_org("Protected Org", owner=owner)
    member = _make_user("staff@x.com")
    OrganizationMembership.objects.create(user=member, organization=org, role="staff")
    client = APIClient()
    client.force_authenticate(user=member)
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": "Hijack"}, format="json")
    assert r.status_code == 403, r.content
    org.refresh_from_db()
    assert org.name == "Protected Org"


def test_empty_name_returns_400():
    user = _make_user("owner3@x.com")
    org = _make_org("Valid Name", owner=user)
    client = APIClient()
    client.force_authenticate(user=user)
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": ""}, format="json")
    assert r.status_code == 400


def test_slug_in_read_only_fields():
    s = OrganizationSerializer()
    assert "slug" in s.Meta.read_only_fields
