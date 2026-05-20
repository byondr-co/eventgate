import pytest

from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.orgs.models import Organization


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
