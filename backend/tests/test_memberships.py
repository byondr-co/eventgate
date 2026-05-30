"""Tests for PATCH/DELETE membership CRUD endpoints (Plan K4)."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.orgs.models import Organization, OrganizationMembership

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


def test_admin_patch_role_succeeds():
    owner = _make_user("own@x.com")
    admin = _make_user("a@x.com")
    target = _make_user("t@x.com")
    org = _make_org("O", owner)
    OrganizationMembership.objects.create(user=admin, organization=org, role="admin")
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=admin)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/",
        {"role": "manager"},
        format="json",
    )
    assert r.status_code == 200, r.content
    target_m.refresh_from_db()
    assert target_m.role == "manager"


def test_cannot_demote_sole_owner():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    owner_m = OrganizationMembership.objects.get(user=owner, organization=org)
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/memberships/{owner_m.id}/",
        {"role": "admin"},
        format="json",
    )
    assert r.status_code == 400
    assert "sole owner" in r.json()["detail"].lower()


def test_owner_promotes_second_user_then_demotes_original():
    """Promote second user to owner, then demote original owner — should succeed."""
    owner = _make_user("owner1@x.com")
    second = _make_user("owner2@x.com")
    org = _make_org("O", owner)
    second_m = OrganizationMembership.objects.create(user=second, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=owner)

    # Promote second to owner
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/memberships/{second_m.id}/",
        {"role": "owner"},
        format="json",
    )
    assert r.status_code == 200, r.content

    # Now demote original owner
    owner_m = OrganizationMembership.objects.get(user=owner, organization=org)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/memberships/{owner_m.id}/",
        {"role": "admin"},
        format="json",
    )
    assert r.status_code == 200, r.content
    owner_m.refresh_from_db()
    assert owner_m.role == "admin"


def test_admin_delete_membership_soft_removes():
    owner = _make_user("o@x.com")
    admin = _make_user("a@x.com")
    target = _make_user("t@x.com")
    org = _make_org("O", owner)
    OrganizationMembership.objects.create(user=admin, organization=org, role="admin")
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=admin)
    r = c.delete(f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/")
    assert r.status_code == 204
    target_m.refresh_from_db()
    assert target_m.is_active is False


def test_cannot_remove_sole_owner():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    owner_m = OrganizationMembership.objects.get(user=owner, organization=org)
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.delete(f"/api/v1/orgs/{org.slug}/memberships/{owner_m.id}/")
    assert r.status_code == 400


def test_non_admin_cannot_patch_membership():
    owner = _make_user("o@x.com")
    staff = _make_user("s@x.com")
    target = _make_user("t@x.com")
    org = _make_org("O", owner)
    OrganizationMembership.objects.create(user=staff, organization=org, role="staff")
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=staff)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/",
        {"role": "admin"},
        format="json",
    )
    assert r.status_code == 403
