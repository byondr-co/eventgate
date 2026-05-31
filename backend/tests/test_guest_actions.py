from __future__ import annotations

from unittest.mock import patch

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


def _setup(email="guest@x.com"):
    owner = _make_user("o@x.com")
    org = _make_org("Org", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    guest = Guest.objects.create(
        organization=org, event=event, entry_token="tok123", full_name="G", email=email
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org, event, guest


def test_send_qr_email_enqueues_task():
    client, org, event, guest = _setup()
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/send-qr-email/"
    with patch("apps.guests.views.send_qr_email_task.delay") as delay:
        r = client.post(url)
    assert r.status_code == 202, r.content
    delay.assert_called_once_with(guest_id=str(guest.id))


def test_send_qr_email_400_when_guest_has_no_email():
    client, org, event, guest = _setup(email="")
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/send-qr-email/"
    r = client.post(url)
    assert r.status_code == 400


def test_telegram_link_returns_deep_link(settings):
    settings.TELEGRAM_BOT_USERNAME = "eventgate_bot"
    client, org, event, guest = _setup()
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/telegram-link/"
    r = client.get(url)
    assert r.status_code == 200, r.content
    assert r.json()["url"] == "https://t.me/eventgate_bot?start=tok123"
