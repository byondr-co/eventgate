from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership
from apps.shorturls.models import ShortUrl

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _event(org):
    return Event.objects.create(organization=org, name="E", slug="e")


def test_redirect_increments_visit_count_and_appends_ref(client):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(
        short_code="ABC123xy", target_url="https://app/e/o/e/register", event=event
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 302
    assert r["Location"] == "https://app/e/o/e/register?ref=ABC123xy"
    su.refresh_from_db()
    assert su.visit_count == 1


def test_disabled_short_url_returns_404(client):
    su = ShortUrl.objects.create(short_code="dis00000", target_url="https://x", is_active=False)
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 404


def test_registration_with_ref_sets_referrer(client):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(
        short_code="REF12345", target_url="https://app/e/o/e/register", event=event
    )
    r = client.post(
        f"/api/v1/e/{org.slug}/{event.slug}/register/",
        {"name": "G", "email": "g@x.com", "phone_or_chat": "012", "ref": "REF12345"},
        content_type="application/json",
    )
    assert r.status_code == 201, r.content
    guest = Guest.objects.get(id=r.json()["guest_id"])
    assert guest.referrer_short_url_id == su.id


def test_create_short_url():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {"note": "IG bio"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["note"] == "IG bio"
    assert body["is_active"] is True
    assert body["visit_count"] == 0
    assert body["target_url"].endswith(f"/e/{org.slug}/{event.slug}/register")


def test_patch_short_url_note_and_disable():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(short_code="patch001", target_url="https://x", event=event)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/{su.id}/"
    r = c.patch(url, {"note": "updated", "is_active": False}, format="json")
    assert r.status_code == 200, r.content
    su.refresh_from_db()
    assert su.note == "updated"
    assert su.is_active is False
