from unittest.mock import patch

import pytest

from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import NotificationDispatch, TelegramBinding
from apps.notifications.tasks import send_qr_telegram_task
from apps.orgs.models import Organization


@pytest.fixture
def bound_guest(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    guest = register_guest(
        event=ev,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    TelegramBinding.objects.create(guest=guest, chat_id=42, username="alice")
    return guest


@pytest.mark.django_db
class TestSendQrTelegramTask:
    @patch("apps.notifications.tasks.send_photo")
    def test_happy_path_creates_dispatch_and_audit(self, mock_send, bound_guest):
        send_qr_telegram_task(guest_id=str(bound_guest.id))
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        assert kwargs["chat_id"] == 42
        assert kwargs["photo_bytes"][:8] == b"\x89PNG\r\n\x1a\n"
        d = NotificationDispatch.objects.get(guest=bound_guest, channel="telegram")
        assert d.status == "sent"
        assert AuditEvent.objects.filter(action="notifications.telegram_sent").count() == 1

    @patch("apps.notifications.tasks.send_qr_email_task")
    @patch("apps.notifications.tasks.send_photo")
    def test_unbound_guest_falls_back_to_email(self, mock_send, mock_email_task, db):
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(
            organization=org, name="Conf", slug="conf", registration_open=True
        )
        seed_preset_fields(ev)
        guest = register_guest(
            event=ev,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        # No TelegramBinding — task should bail out and enqueue email fallback.
        send_qr_telegram_task(guest_id=str(guest.id))
        mock_send.assert_not_called()
        mock_email_task.delay.assert_called_once_with(guest_id=str(guest.id))
