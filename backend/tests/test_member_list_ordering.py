import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    owner = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=owner, role="owner")
    zoe = User.objects.create_user(email="zoe@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=zoe, role="admin")
    ana = User.objects.create_user(email="ana@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=ana, role="staff")
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org


@pytest.fixture
def setup_with_distinct_accepted_at(db):
    """Fixture with deterministically staggered accepted_at so asc != desc."""
    base = timezone.now()
    org = Organization.objects.create(name="Acme2", slug="acme2")
    owner = User.objects.create_user(email="owner2@example.com", password="x")
    OrganizationMembership.objects.create(
        organization=org,
        user=owner,
        role="owner",
        accepted_at=base,
    )
    zoe = User.objects.create_user(email="zoe2@example.com", password="x")
    OrganizationMembership.objects.create(
        organization=org,
        user=zoe,
        role="admin",
        accepted_at=base + datetime.timedelta(seconds=10),
    )
    ana = User.objects.create_user(email="ana2@example.com", password="x")
    OrganizationMembership.objects.create(
        organization=org,
        user=ana,
        role="staff",
        accepted_at=base + datetime.timedelta(seconds=20),
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org


@pytest.mark.django_db
def test_member_ordering_by_email(setup):
    client, org = setup
    resp = client.get(f"/api/v1/orgs/{org.slug}/members/", {"ordering": "user__email"})
    assert resp.status_code == 200
    emails = [m["user_email"] for m in resp.json()["results"]]
    assert emails == sorted(emails)

    resp_rev = client.get(f"/api/v1/orgs/{org.slug}/members/", {"ordering": "-user__email"})
    assert resp_rev.status_code == 200
    emails_rev = [m["user_email"] for m in resp_rev.json()["results"]]
    assert emails_rev == sorted(emails_rev, reverse=True)
    assert emails_rev != sorted(emails_rev)  # proves a non-default order is applied


@pytest.mark.django_db
def test_member_ordering_by_accepted_at(setup_with_distinct_accepted_at):
    client, org = setup_with_distinct_accepted_at
    asc = [
        m["user_email"]
        for m in client.get(
            f"/api/v1/orgs/{org.slug}/members/", {"ordering": "accepted_at"}
        ).json()["results"]
    ]
    desc = [
        m["user_email"]
        for m in client.get(
            f"/api/v1/orgs/{org.slug}/members/", {"ordering": "-accepted_at"}
        ).json()["results"]
    ]
    assert asc == list(reversed(desc))
    assert len(asc) == 3
