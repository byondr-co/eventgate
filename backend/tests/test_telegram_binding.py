import pytest
from django.db import IntegrityError

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import TelegramBinding
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestTelegramBinding:
    def test_create_binding_sets_org_from_guest(self, event):
        guest = register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        b = TelegramBinding.objects.create(guest=guest, chat_id=12345, username="alice_tg")
        assert b.organization == event.organization
        assert b.chat_id == 12345
        assert b.username == "alice_tg"
        assert b.bound_at is not None

    def test_chat_id_is_unique(self, event):
        g1 = register_guest(
            event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "+1"}
        )
        g2 = register_guest(
            event=event, payload={"name": "B", "email": "b@x.com", "phone_or_chat": "+2"}
        )
        TelegramBinding.objects.create(guest=g1, chat_id=999)
        with pytest.raises(IntegrityError):
            TelegramBinding.objects.create(guest=g2, chat_id=999)
