"""Tests for shorturls — Plan K5."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership
from apps.shorturls.models import ShortUrl
from apps.shorturls.services import _ALPHABET, generate_short_code

pytestmark = pytest.mark.django_db

User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role="owner")
    return org


def test_redirect_returns_302(client):
    su = ShortUrl.objects.create(
        short_code="aB7k9Xq2",
        target_url="https://example.com/landing",
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 302
    assert r["Location"] == "https://example.com/landing?ref=aB7k9Xq2"


def test_unknown_code_returns_404(client):
    r = client.get("/r/nonexistent/")
    assert r.status_code == 404


def test_expired_short_url_returns_404(client):
    su = ShortUrl.objects.create(
        short_code="expCode1",
        target_url="https://example.com/x",
        expires_at=timezone.now() - timedelta(hours=1),
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 404


def test_generate_short_code_returns_unique_8char_value():
    code = generate_short_code()
    assert len(code) == 8
    assert ShortUrl.objects.filter(short_code=code).count() == 0


def test_generate_short_code_uses_base58_alphabet():
    """Verify generated codes only use the base58 alphabet (no 0, O, I, l)."""
    for _ in range(20):
        code = generate_short_code()
        for char in code:
            assert char in _ALPHABET, f"char {char!r} not in base58 alphabet"


def test_event_create_auto_creates_short_url():
    user = _make_user("o@x.com")
    org = _make_org("O", user)
    event = Event.objects.create(organization=org, name="Test Event", slug="test-event")
    assert ShortUrl.objects.filter(event=event).count() == 1
    su = ShortUrl.objects.filter(event=event).first()
    assert su.short_code  # non-empty
    assert "/e/" in su.target_url
    assert su.target_url.endswith("/register")
