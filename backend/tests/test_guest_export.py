import csv as _csv
import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    RegistrationField.objects.create(
        event=event, field_key="company", label_en="Company", order_index=1
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="t1",
        full_name="Ana",
        email="ana@x.com",
        custom_fields={"company": "Acme Inc"},
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="t2",
        full_name="Bob",
        entry_status="checked_in",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


def export_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/export/"


def _rows(resp):
    text = b"".join(resp.streaming_content).decode("utf-8")
    return list(_csv.reader(io.StringIO(text)))


@pytest.mark.django_db
def test_export_columns_and_custom_field(setup):
    client, org, event = setup
    resp = client.post(export_url(org, event), {}, format="json")
    assert resp.status_code == 200
    assert resp["Content-Disposition"] == 'attachment; filename="launch-guests.csv"'
    rows = _rows(resp)
    assert rows[0] == [
        "Name",
        "Email",
        "Phone/Chat",
        "Company",
        "Type",
        "Entry status",
        "Checked in at",
        "Registered at",
    ]
    ana = next(r for r in rows[1:] if r[0] == "Ana")
    assert ana[3] == "Acme Inc"  # custom field column


@pytest.mark.django_db
def test_export_respects_filters(setup):
    client, org, event = setup
    resp = client.post(
        export_url(org, event), {"filters": {"guest_type": "walk_in"}}, format="json"
    )
    names = [r[0] for r in _rows(resp)[1:]]
    assert names == ["Bob"]


@pytest.mark.django_db
def test_export_ids_subset(setup):
    client, org, event = setup
    bob = Guest.objects.get(event=event, full_name="Bob")
    resp = client.post(export_url(org, event), {"ids": [str(bob.id)]}, format="json")
    names = [r[0] for r in _rows(resp)[1:]]
    assert names == ["Bob"]
