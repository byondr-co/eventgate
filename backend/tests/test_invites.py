"""Tests for invite cancel endpoint and pending-invites list (Plan K4)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orgs.models import Invite, Organization, OrganizationMembership

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


def _make_invite(org, email="new@x.com", role="staff", token_suffix="a") -> Invite:
    return Invite.objects.create(
        organization=org,
        email=email,
        role=role,
        token_hash=token_suffix * 64,
        expires_at=timezone.now() + timedelta(days=3),
    )


def test_owner_can_cancel_pending_invite():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    invite = _make_invite(org, email="new@x.com")
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.delete(f"/api/v1/orgs/{org.slug}/invites/{invite.id}/")
    assert r.status_code == 204
    invite.refresh_from_db()
    assert invite.revoked_at is not None


def test_cannot_cancel_accepted_invite():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    invite = _make_invite(org, email="accepted@x.com", token_suffix="b")
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["accepted_at"])
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.delete(f"/api/v1/orgs/{org.slug}/invites/{invite.id}/")
    assert r.status_code == 400
    assert "accepted" in r.json()["detail"].lower()


def test_list_pending_invites_returns_only_pending():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)

    # Create pending invite
    pending = _make_invite(org, email="pending@x.com", token_suffix="c")

    # Create accepted invite (should not appear)
    accepted = _make_invite(org, email="accepted@x.com", token_suffix="d")
    accepted.accepted_at = timezone.now()
    accepted.save(update_fields=["accepted_at"])

    # Create revoked invite (should not appear)
    revoked = _make_invite(org, email="revoked@x.com", token_suffix="e")
    revoked.revoked_at = timezone.now()
    revoked.save(update_fields=["revoked_at"])

    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.get(f"/api/v1/orgs/{org.slug}/invites/")
    assert r.status_code == 200
    data = r.json()
    ids = [i["id"] for i in data["results"]]
    assert str(pending.id) in ids
    assert str(accepted.id) not in ids
    assert str(revoked.id) not in ids


def test_non_admin_cannot_cancel_invite():
    owner = _make_user("o@x.com")
    staff = _make_user("s@x.com")
    org = _make_org("O", owner)
    OrganizationMembership.objects.create(user=staff, organization=org, role="staff")
    invite = _make_invite(org, email="target@x.com", token_suffix="f")
    c = APIClient()
    c.force_authenticate(user=staff)
    r = c.delete(f"/api/v1/orgs/{org.slug}/invites/{invite.id}/")
    assert r.status_code == 403
