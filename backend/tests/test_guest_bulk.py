import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


def bulk_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/bulk/"


@pytest.mark.django_db
def test_bulk_void(setup):
    client, org, event = setup
    g = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered", entry_token="t1"
    )
    resp = client.post(
        bulk_url(org, event), {"action": "void", "guest_ids": [str(g.id)]}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["done"] == 1
    g.refresh_from_db()
    assert g.entry_status == "voided"


@pytest.mark.django_db
def test_bulk_delete_skips_history(setup):
    client, org, event = setup
    clean = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered", entry_token="t1"
    )
    historied = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered", entry_token="t2"
    )
    write_audit(
        organization=org,
        event=event,
        guest=historied,
        actor_type="user",
        actor_id="x",
        action="checkin.success",
        result="success",
    )
    resp = client.post(
        bulk_url(org, event),
        {"action": "delete", "guest_ids": [str(clean.id), str(historied.id)]},
        format="json",
    )
    body = resp.json()
    assert body["done"] == 1
    assert body["skipped"] == [{"id": str(historied.id), "reason": "has_history"}]
    assert not Guest.objects.filter(pk=clean.pk).exists()
    assert Guest.objects.filter(pk=historied.pk).exists()


@pytest.mark.django_db
def test_bulk_resend_skips_walkin_and_no_email(setup):
    client, org, event = setup
    ok = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="t1",
        email="a@x.com",
    )
    walkin = Guest.objects.create(
        organization=org, event=event, guest_type="walk_in", entry_token="t2", email="b@x.com"
    )
    resp = client.post(
        bulk_url(org, event),
        {"action": "resend_qr", "guest_ids": [str(ok.id), str(walkin.id)]},
        format="json",
    )
    body = resp.json()
    assert body["done"] == 1
    assert {"id": str(walkin.id), "reason": "walk_in"} in body["skipped"]


@pytest.mark.django_db
def test_bulk_rejects_bad_action(setup):
    client, org, event = setup
    resp = client.post(bulk_url(org, event), {"action": "nuke", "guest_ids": []}, format="json")
    assert resp.status_code == 400
