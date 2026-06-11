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


# --- expires_at validation tests (EVENTGATE-PROD-3) ---


def test_create_short_url_date_only_expires_at():
    """POST with date-only string → 201, serialised expires_at contains the date, DB row is aware."""
    owner = _make_user("exp1@x.com")
    org = _make_org("Exp1", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {"expires_at": "2026-12-31"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["expires_at"] is not None
    assert "2026-12-3" in body["expires_at"]
    # DB row must be timezone-aware
    from django.utils import timezone as tz

    su = ShortUrl.objects.get(id=body["id"])
    assert tz.is_aware(su.expires_at)


def test_create_short_url_iso_datetime_expires_at():
    """POST with ISO datetime string → 201, serialised expires_at starts with expected value."""
    owner = _make_user("exp2@x.com")
    org = _make_org("Exp2", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {"expires_at": "2026-12-31T10:00:00Z"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["expires_at"] is not None
    assert body["expires_at"].startswith("2026-12-31T10:00:00")


def test_create_short_url_invalid_expires_at_returns_400():
    """POST with garbage expires_at → 400 with 'expires_at' key in response."""
    owner = _make_user("exp3@x.com")
    org = _make_org("Exp3", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {"expires_at": "not-a-date"}, format="json")
    assert r.status_code == 400, r.content
    assert "expires_at" in r.json()


def test_create_short_url_null_expires_at():
    """POST with no/null expires_at → 201, expires_at is None."""
    owner = _make_user("exp4@x.com")
    org = _make_org("Exp4", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["expires_at"] is None


def test_patch_short_url_date_only_expires_at():
    """PATCH with date-only string → 200, serialised expires_at contains the date."""
    owner = _make_user("exp5@x.com")
    org = _make_org("Exp5", owner)
    event = _event(org)
    su = ShortUrl.objects.create(short_code="patchexp1", target_url="https://x", event=event)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/{su.id}/"
    r = c.patch(url, {"expires_at": "2026-12-31"}, format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["expires_at"] is not None
    assert "2026-12-3" in body["expires_at"]


def test_patch_short_url_invalid_expires_at_returns_400():
    """PATCH with garbage expires_at → 400 with 'expires_at' key in response."""
    owner = _make_user("exp6@x.com")
    org = _make_org("Exp6", owner)
    event = _event(org)
    su = ShortUrl.objects.create(short_code="patchexp2", target_url="https://x", event=event)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/{su.id}/"
    r = c.patch(url, {"expires_at": "garbage"}, format="json")
    assert r.status_code == 400, r.content
    assert "expires_at" in r.json()
