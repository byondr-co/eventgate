import pytest
from django.core import mail

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import NotificationDispatch
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestQrEmailTask:
    def test_register_guest_sends_qr_email(self, event):
        mail.outbox.clear()  # ensure isolated
        register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ["alice@example.com"]
        assert (
            "register" in msg.subject.lower()
            or "eventgate" in msg.subject.lower()
            or msg.subject.lower().startswith("you're")
        )
        assert len(msg.attachments) == 1
        name, content, mimetype = msg.attachments[0]
        assert name.endswith(".png")
        assert mimetype == "image/png"
        assert content[:8] == b"\x89PNG\r\n\x1a\n"
        d = NotificationDispatch.objects.get(template="pre_reg_qr")
        assert d.status == "sent"

    def test_register_guest_without_email_skips_send(self, event):
        from apps.events.models import RegistrationField

        RegistrationField.objects.filter(event=event, field_key="email").update(required=False)
        mail.outbox.clear()
        register_guest(
            event=event,
            payload={"name": "Alice", "phone_or_chat": "+1"},
        )
        assert len(mail.outbox) == 0
        assert not NotificationDispatch.objects.filter(template="pre_reg_qr").exists()


@pytest.mark.django_db
def test_email_body_includes_telegram_link_when_bot_username_set(event, settings):
    settings.TELEGRAM_BOT_USERNAME = "EventgateBot"
    mail.outbox.clear()
    guest = register_guest(
        event=event,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    msg = mail.outbox[0]
    assert f"https://t.me/EventgateBot?start={guest.entry_token}" in msg.body


@pytest.mark.django_db
def test_email_body_omits_telegram_link_when_bot_username_blank(event, settings):
    settings.TELEGRAM_BOT_USERNAME = ""
    mail.outbox.clear()
    register_guest(
        event=event,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    msg = mail.outbox[0]
    assert "t.me/" not in msg.body
