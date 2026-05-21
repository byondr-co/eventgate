"""Sync endpoint for the scanner PWA. Minimal projection, scanner-session-auth."""

from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.common.tokens import hash_token
from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def org_event_device_session(db):
    """Mint an org + event + scanner device + active session in one go."""
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate 1",
        role="scanner",
        device_token_hash=hash_token("device-token-raw"),
    )
    raw_session = "session-token-raw"
    session = EventPinSession.objects.create(
        event=event,
        scanner_device=device,
        session_token_hash=hash_token(raw_session),
        expires_at=timezone.now() + timezone.timedelta(hours=8),
    )
    return org, event, device, session, raw_session


@pytest.mark.django_db
def test_guests_sync_returns_minimal_projection(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Alice Example",
        email="alice@example.com",
        entry_token="raw-token-1",
        entry_status="registered_not_arrived",
        info_status="info_completed",
    )

    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")

    assert res.status_code == 200
    body = res.json()
    assert "guests" in body
    assert "cursor" in body
    assert len(body["guests"]) == 1
    row = body["guests"][0]
    assert set(row.keys()) == {
        "id",
        "entry_token",
        "full_name",
        "email",
        "guest_type",
        "entry_status",
        "info_status",
        "updated_at",
    }
    assert row["entry_token"] == "raw-token-1"
    assert row["id"] == str(guest.id)


@pytest.mark.django_db
def test_guests_sync_rejects_without_session(client, org_event_device_session):
    org, event, *_ = org_event_device_session
    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url)
    assert res.status_code == 401


@pytest.mark.django_db
def test_guests_sync_since_returns_only_newer_rows(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    # Old guest — should be filtered out
    old = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Old",
        email="old@example.com",
        entry_token="t-old",
    )
    cursor = (old.updated_at + timezone.timedelta(seconds=1)).isoformat()
    new = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="New",
        email="new@example.com",
        entry_token="t-new",
    )
    # Force New's updated_at past the cursor (creation timestamps are too close
    # to differ by a full second on a fast machine; `auto_now` only fires on save).
    Guest.objects.filter(pk=new.pk).update(
        updated_at=old.updated_at + timezone.timedelta(seconds=2)
    )

    url = reverse("guest-sync", args=[org.slug, event.slug]) + f"?since={cursor}"
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert res.status_code == 200
    body = res.json()
    names = {g["full_name"] for g in body["guests"]}
    assert names == {"New"}


@pytest.mark.django_db
def test_guests_sync_etag_returns_304(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="A",
        email="a@example.com",
        entry_token="t-a",
    )
    url = reverse("guest-sync", args=[org.slug, event.slug])
    first = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert first.status_code == 200
    etag = first["ETag"]
    second = client.get(
        url,
        HTTP_AUTHORIZATION=f"Bearer {raw_session}",
        HTTP_IF_NONE_MATCH=etag,
    )
    assert second.status_code == 304


@pytest.mark.django_db
def test_guests_sync_returns_guests_for_this_event_only(client, org_event_device_session):
    org, event, _device, _session, raw_session = org_event_device_session
    other_event = Event.objects.create(organization=org, name="Other", slug="other")
    Guest.objects.create(
        organization=org,
        event=other_event,
        guest_type="pre_registered",
        full_name="Other Guest",
        email="other@example.com",
        entry_token="t-other",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="This Guest",
        email="this@example.com",
        entry_token="t-this",
    )
    url = reverse("guest-sync", args=[org.slug, event.slug])
    res = client.get(url, HTTP_AUTHORIZATION=f"Bearer {raw_session}")
    assert res.status_code == 200
    names = {g["full_name"] for g in res.json()["guests"]}
    assert names == {"This Guest"}
