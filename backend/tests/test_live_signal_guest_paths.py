import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.services import write_audit
from apps.devices.models import ScannerDevice
from apps.events.models import Event, RegistrationField
from apps.guests.models import CsvImport, Guest
from apps.guests.services import register_guest
from apps.guests.tasks import process_csv_import_task
from apps.orgs.models import Organization, OrganizationMembership
from apps.walkins.services import claim_walkin, complete_walkin_info, get_or_create_displayed

pytestmark = pytest.mark.django_db


@pytest.fixture
def env():
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    RegistrationField.objects.create(
        event=event, field_key="email", label_en="Email", required=True
    )
    return org, user, event


@pytest.fixture
def authed_client(env):
    _, user, _ = env
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def guest_url(org, event, guest):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/"


def bulk_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/bulk/"


def make_guest(org, event, **overrides):
    data = {
        "organization": org,
        "event": event,
        "guest_type": "pre_registered",
        "entry_token": f"tok-{Guest.objects.count() + 1}",
        "entry_status": "registered_not_arrived",
        "email": "guest@example.com",
    }
    data.update(overrides)
    return Guest.objects.create(**data)


def test_register_guest_schedules_live_publish(monkeypatch, env):
    _, _, event = env
    publishes = []
    monkeypatch.setattr(
        "apps.guests.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )
    monkeypatch.setattr("apps.guests.tasks.send_qr_email_task.delay", lambda **kw: None)

    register_guest(event=event, payload={"email": "a@example.com"})

    assert publishes[0]["reason"] == "guest.registered"
    assert "guests_count" in publishes[0]["keys"]


def test_guest_patch_schedules_live_publish(monkeypatch, env, authed_client):
    org, _, event = env
    guest = make_guest(org, event)
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.patch(
        guest_url(org, event, guest), {"full_name": "Ana Lim"}, format="json"
    )

    assert response.status_code == 200
    assert publishes == [
        {
            "event_id": event.id,
            "reason": "guest.updated",
            "keys": ("stats", "audit", "guests_count"),
        }
    ]


def test_guest_void_schedules_live_publish(monkeypatch, env, authed_client):
    org, _, event = env
    guest = make_guest(org, event)
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.post(guest_url(org, event, guest) + "void/")

    assert response.status_code == 200
    assert publishes[0]["reason"] == "guest.voided"
    assert publishes[0]["keys"] == ("stats", "audit", "guests_count")


def test_guest_delete_schedules_live_publish(monkeypatch, env, authed_client):
    org, _, event = env
    guest = make_guest(org, event)
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.delete(guest_url(org, event, guest))

    assert response.status_code == 204
    assert publishes == [
        {
            "event_id": event.id,
            "reason": "guest.deleted",
            "keys": ("stats", "audit", "guests_count"),
        }
    ]


def test_guest_bulk_void_schedules_one_live_publish(monkeypatch, env, authed_client):
    org, _, event = env
    guests = [make_guest(org, event, entry_token=f"bulk-{idx}") for idx in range(2)]
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.post(
        bulk_url(org, event),
        {"action": "void", "guest_ids": [str(guest.id) for guest in guests]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["done"] == 2
    assert publishes == [
        {
            "event_id": event.id,
            "reason": "guest.bulk_action",
            "keys": ("stats", "audit", "guests_count"),
        }
    ]


def test_guest_bulk_delete_schedules_per_guest_and_aggregate_live_publish(
    monkeypatch, env, authed_client
):
    org, user, event = env
    deletable_one = make_guest(org, event, entry_token="bulk-delete-1")
    historied = make_guest(org, event, entry_token="bulk-delete-history")
    deletable_two = make_guest(org, event, entry_token="bulk-delete-2")
    write_audit(
        organization=org,
        event=event,
        guest=historied,
        actor_type="user",
        actor_id=str(user.id),
        action="checkin.success",
        result="success",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.post(
        bulk_url(org, event),
        {
            "action": "delete",
            "guest_ids": [
                str(deletable_one.id),
                str(historied.id),
                str(deletable_two.id),
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["done"] == 2
    assert response.json()["skipped"] == [{"id": str(historied.id), "reason": "has_history"}]
    assert publishes == [
        {
            "event_id": event.id,
            "reason": "guest.deleted",
            "keys": ("stats", "audit", "guests_count"),
        },
        {
            "event_id": event.id,
            "reason": "guest.deleted",
            "keys": ("stats", "audit", "guests_count"),
        },
        {
            "event_id": event.id,
            "reason": "guest.bulk_action",
            "keys": ("stats", "audit", "guests_count"),
        },
    ]


def test_guest_bulk_resend_qr_does_not_publish_live_invalidation(monkeypatch, env, authed_client):
    org, _, event = env
    guest = make_guest(org, event, email="guest@example.com")
    resends = []
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.send_qr_email_task.delay", lambda **kw: resends.append(kw)
    )
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.post(
        bulk_url(org, event),
        {"action": "resend_qr", "guest_ids": [str(guest.id)]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["done"] == 1
    assert resends == [{"guest_id": str(guest.id)}]
    assert publishes == []


def test_guest_bulk_no_done_does_not_publish(monkeypatch, env, authed_client):
    org, _, event = env
    publishes = []
    monkeypatch.setattr(
        "apps.guests.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = authed_client.post(
        bulk_url(org, event),
        {"action": "void", "guest_ids": ["00000000-0000-0000-0000-000000000000"]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["done"] == 0
    assert publishes == []


def test_csv_import_completion_schedules_live_publish(monkeypatch, env):
    _, user, event = env
    content = "Email\na@example.com\n"
    import_job = CsvImport.objects.create(
        event=event,
        uploaded_by=user,
        file=SimpleUploadedFile("guests.csv", content.encode("utf-8")),
        column_mapping={"0": "email"},
        status="pending",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.guests.tasks.schedule_event_changed", lambda **kw: publishes.append(kw)
    )
    monkeypatch.setattr("apps.guests.services.schedule_event_changed", lambda **kw: None)
    monkeypatch.setattr("apps.guests.tasks.send_qr_email_task.delay", lambda **kw: None)

    result = process_csv_import_task(import_id=str(import_job.id))

    assert result == "complete:1/1"
    assert publishes == [
        {
            "event_id": event.id,
            "reason": "csv_import.complete",
            "keys": ("stats", "audit", "guests_count"),
        }
    ]


def test_walkin_display_create_schedules_live_publish(monkeypatch, env):
    org, _, event = env
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="WalkinTablet",
        role="walkin_display",
        device_token_hash="hash",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    get_or_create_displayed(device=device, gate="North", scanner_label="WalkinTablet")

    assert publishes[0]["reason"] == "walkin.display.create"
    assert publishes[0]["keys"] == ("stats", "audit", "guests_count")


def test_walkin_display_existing_noop_does_not_publish(monkeypatch, env):
    org, _, event = env
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="WalkinTablet",
        role="walkin_display",
        device_token_hash="hash",
    )
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="displayed",
        gate="North",
        scanner="WalkinTablet",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    returned, _ = get_or_create_displayed(device=device, gate="North", scanner_label="WalkinTablet")

    assert returned == guest
    assert publishes == []


def test_walkin_claim_schedules_checkin_metric_and_live_publish(monkeypatch, env):
    org, _, event = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="displayed",
        gate="North",
        scanner="WalkinTablet",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    claim_walkin(org_slug=org.slug, event_slug=event.slug, token=guest.entry_token)

    assert metrics[0]["counter"] == "checkins"
    assert metrics[0]["gate"] == "North"
    assert publishes[0]["reason"] == "walkin.claim"


def test_walkin_claim_checked_in_noop_does_not_publish_or_increment(monkeypatch, env):
    org, _, event = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="checked_in",
        info_status="claimed_pending_info",
        gate="North",
        scanner="WalkinTablet",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    claim_walkin(org_slug=org.slug, event_slug=event.slug, token=guest.entry_token)

    assert metrics == []
    assert publishes == []


def test_walkin_info_completed_schedules_live_publish(monkeypatch, env):
    org, _, event = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="checked_in",
        info_status="claimed_pending_info",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    complete_walkin_info(
        org_slug=org.slug,
        event_slug=event.slug,
        token=guest.entry_token,
        payload={"email": "walk@example.com"},
    )

    assert publishes[0]["reason"] == "walkin.info_completed"
    assert publishes[0]["keys"] == ("stats", "audit", "guests_count")


def test_walkin_info_completed_noop_does_not_publish(monkeypatch, env):
    org, _, event = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="walk",
        entry_status="checked_in",
        info_status="info_completed",
        email="original@example.com",
    )
    publishes = []
    monkeypatch.setattr(
        "apps.walkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    complete_walkin_info(
        org_slug=org.slug,
        event_slug=event.slug,
        token=guest.entry_token,
        payload={"email": "new@example.com"},
    )

    assert publishes == []
