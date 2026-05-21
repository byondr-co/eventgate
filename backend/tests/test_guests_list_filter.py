"""GuestListView accepts ?entry_status=<status>."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="A",
        entry_status="checked_in",
        entry_token="ta",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="B",
        entry_status="manual_review",
        entry_token="tb",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="C",
        entry_status="manual_review",
        entry_token="tc",
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_filter_by_manual_review(env):
    c, org, event = env
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/?entry_status=manual_review")
    assert r.status_code == 200
    body = r.json()
    results = body.get("results") if isinstance(body, dict) and "results" in body else body
    assert len(results) == 2
    assert all(g["entry_status"] == "manual_review" for g in results)


def test_no_filter_returns_all(env):
    c, org, event = env
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/")
    body = r.json()
    results = body.get("results") if isinstance(body, dict) and "results" in body else body
    assert len(results) == 3
