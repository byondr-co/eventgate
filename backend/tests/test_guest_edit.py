import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok-1",
        full_name="Ana",
        email="ana@x.com",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event, guest


def guest_url(org, event, guest):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/"


@pytest.mark.django_db
def test_guest_detail_get(setup):
    client, org, event, guest = setup
    resp = client.get(guest_url(org, event, guest))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Ana"


@pytest.mark.django_db
def test_guest_patch_updates_contact_and_audits(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.patch(
        guest_url(org, event, guest),
        {"full_name": "Ana Lim", "email": "ana.lim@x.com"},
        format="json",
    )
    assert resp.status_code == 200
    guest.refresh_from_db()
    assert guest.full_name == "Ana Lim"
    assert guest.email == "ana.lim@x.com"
    assert guest.entry_token == "tok-1"  # unchanged
    assert AuditEvent.objects.filter(action="guest.updated", guest=guest).exists()


@pytest.mark.django_db
def test_guest_patch_cannot_change_entry_status(setup):
    client, org, event, guest = setup
    client.patch(guest_url(org, event, guest), {"entry_status": "checked_in"}, format="json")
    guest.refresh_from_db()
    assert guest.entry_status == "registered_not_arrived"


@pytest.mark.django_db
def test_guest_void_sets_status_and_audits(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.post(guest_url(org, event, guest) + "void/")
    assert resp.status_code == 200
    guest.refresh_from_db()
    assert guest.entry_status == "voided"
    assert AuditEvent.objects.filter(action="guest.voided", guest=guest).exists()
    # idempotent
    assert client.post(guest_url(org, event, guest) + "void/").status_code == 200


@pytest.mark.django_db
def test_guest_delete_succeeds_with_no_history(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.delete(guest_url(org, event, guest))
    assert resp.status_code == 204
    assert not Guest.objects.filter(pk=guest.pk).exists()
    assert AuditEvent.objects.filter(action="guest.deleted", guest__isnull=True).exists()


@pytest.mark.django_db
def test_guest_delete_blocked_with_history(setup):
    from apps.audit.services import write_audit

    client, org, event, guest = setup
    write_audit(
        organization=org,
        event=event,
        guest=guest,
        actor_type="user",
        actor_id="x",
        action="checkin.success",
        result="success",
    )
    resp = client.delete(guest_url(org, event, guest))
    assert resp.status_code == 409
    assert Guest.objects.filter(pk=guest.pk).exists()
