import pytest
from rest_framework.test import APIClient

from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def test_public_event_detail_anonymous():
    org = Organization.objects.create(name="O", slug="acme")
    event = Event.objects.create(
        organization=org,
        name="Conf 2026",
        slug="conf",
        venue="Phnom Penh",
        registration_open=True,
        walkins_enabled=True,
    )
    seed_preset_fields(event)
    RegistrationField.objects.create(
        event=event,
        field_key="company",
        label_en="Company",
        label_km="ក្រុមហ៊ុន",
        field_type="text",
        required=False,
        order_index=10,
    )
    anon = APIClient()
    r = anon.get("/api/v1/e/acme/conf/")
    assert r.status_code == 200
    body = r.data
    assert body["name"] == "Conf 2026"
    assert body["slug"] == "conf"
    assert body["org_slug"] == "acme"
    assert body["registration_open"] is True
    assert body["walkins_enabled"] is True
    assert body["venue"] == "Phnom Penh"
    field_keys = [f["field_key"] for f in body["fields"]]
    assert "name" in field_keys
    assert "company" in field_keys
    company = next(f for f in body["fields"] if f["field_key"] == "company")
    assert company["label_en"] == "Company"
    assert company["label_km"] == "ក្រុមហ៊ុន"


def test_public_event_detail_404_for_unknown():
    anon = APIClient()
    r = anon.get("/api/v1/e/none/nope/")
    assert r.status_code == 404


def test_public_event_detail_does_not_leak_pin_hash():
    org = Organization.objects.create(name="O", slug="acme")
    Event.objects.create(
        organization=org,
        name="Conf 2026",
        slug="conf",
        event_pin_hash="secret-hash",
    )
    anon = APIClient()
    r = anon.get("/api/v1/e/acme/conf/")
    assert r.status_code == 200
    assert "event_pin_hash" not in r.data
