import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf")


@pytest.mark.django_db
class TestRegistrationField:
    def test_create_field(self, event) -> None:
        f = RegistrationField.objects.create(
            event=event,
            field_key="name",
            label_en="Name",
            field_type="text",
            required=True,
            order_index=0,
        )
        assert f.field_key == "name"
        assert f.required is True

    def test_field_key_unique_per_event(self, event) -> None:
        from django.db import IntegrityError

        RegistrationField.objects.create(
            event=event, field_key="email", label_en="Email", field_type="email", order_index=0
        )
        with pytest.raises(IntegrityError):
            RegistrationField.objects.create(
                event=event,
                field_key="email",
                label_en="Email 2",
                field_type="email",
                order_index=1,
            )

    def test_order_is_default_ordering(self, event) -> None:
        RegistrationField.objects.create(
            event=event, field_key="b", label_en="B", field_type="text", order_index=1
        )
        RegistrationField.objects.create(
            event=event, field_key="a", label_en="A", field_type="text", order_index=0
        )
        keys = list(event.registration_fields.values_list("field_key", flat=True))
        assert keys == ["a", "b"]


@pytest.mark.django_db
class TestSeedPresetFields:
    def test_seeds_three_preset_fields(self, event) -> None:
        seed_preset_fields(event)
        keys = sorted(event.registration_fields.values_list("field_key", flat=True))
        assert keys == ["email", "name", "phone_or_chat"]

    def test_idempotent(self, event) -> None:
        seed_preset_fields(event)
        seed_preset_fields(event)
        assert event.registration_fields.count() == 3


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def alice_in_acme(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    alice = User.objects.create_user(email="alice@example.com")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(user=alice, organization=org, role="admin")
    return alice, org


@pytest.fixture
def conf_with_presets(alice_in_acme):
    _, org = alice_in_acme
    ev = Event.objects.create(organization=org, name="Conf", slug="conf")
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestFieldEndpoints:
    def test_list_returns_seeded_fields(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/api/v1/orgs/acme/events/conf/fields/")
        assert response.status_code == 200
        keys = sorted(f["field_key"] for f in response.json()["results"])
        assert keys == ["email", "name", "phone_or_chat"]

    def test_add_custom_field(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/conf/fields/",
            {
                "field_key": "company",
                "label_en": "Company",
                "label_km": "ក្រុមហ៊ុន",
                "field_type": "text",
                "order_index": 5,
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["is_preset"] is False

    def test_cannot_delete_preset(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.delete("/api/v1/orgs/acme/events/conf/fields/email/")
        assert response.status_code == 403

    def test_can_delete_custom(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        client.post(
            "/api/v1/orgs/acme/events/conf/fields/",
            {"field_key": "company", "label_en": "Company", "field_type": "text", "order_index": 5},
            format="json",
        )
        response = client.delete("/api/v1/orgs/acme/events/conf/fields/company/")
        assert response.status_code == 204
