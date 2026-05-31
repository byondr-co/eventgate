from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _setup():
    owner = _make_user("o@x.com")
    org = _make_org("Org", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    Guest.objects.create(
        organization=org,
        event=event,
        entry_token="t1",
        full_name="Alice Smith",
        email="alice@x.com",
        phone_or_chat="012",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        entry_token="t2",
        full_name="Bob Jones",
        email="bob@y.com",
        phone_or_chat="099",
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org, event


def _url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/"


def test_search_matches_name():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "alice"})
    assert r.status_code == 200, r.content
    names = [g["full_name"] for g in r.json()["results"]]
    assert names == ["Alice Smith"]


def test_search_matches_email_case_insensitive():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "BOB@Y"})
    assert [g["full_name"] for g in r.json()["results"]] == ["Bob Jones"]


def test_search_matches_phone():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "099"})
    assert [g["full_name"] for g in r.json()["results"]] == ["Bob Jones"]


def test_no_search_returns_all():
    client, org, event = _setup()
    r = client.get(_url(org, event))
    assert r.json()["count"] == 2
