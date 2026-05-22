from unittest.mock import patch

import pytest

from apps.audit.models import AuditEvent
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


WEBHOOK_URL = "/api/v1/telegram/webhook/"


def _update(text: str, chat_id: int = 111, username: str = "alice"):
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "from": {"id": chat_id, "username": username, "first_name": "Alice"},
            "chat": {"id": chat_id, "type": "private"},
            "date": 1700000000,
            "text": text,
        },
    }


def _post(client, payload, secret=None):
    headers = {}
    if secret is not None:
        headers["HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN"] = secret
    return client.post(WEBHOOK_URL, data=payload, content_type="application/json", **headers)


@pytest.mark.django_db
@patch("apps.notifications.views.send_message")
@patch("apps.notifications.views.send_qr_telegram_task")
class TestTelegramWebhook:
    def test_secret_mismatch_returns_200_no_op(
        self, mock_task, mock_reply, client, event, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "right"
        resp = _post(client, _update("/start anything"), secret="wrong")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_not_called()
        assert TelegramBinding.objects.count() == 0

    def test_start_unknown_token_replies_and_audits(
        self, mock_task, mock_reply, client, event, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        resp = _post(client, _update("/start nonexistent_token_xyz"), secret="secret")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_called_once()
        assert "no longer valid" in mock_reply.call_args.kwargs["text"]
        assert AuditEvent.objects.filter(action="notifications.telegram_unknown_start").count() == 1

    def test_start_known_token_creates_binding_audits_and_enqueues(
        self, mock_task, mock_reply, client, event, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        guest = register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        resp = _post(client, _update(f"/start {guest.entry_token}", chat_id=42), secret="secret")
        assert resp.status_code == 200
        b = TelegramBinding.objects.get(guest=guest)
        assert b.chat_id == 42
        assert b.username == "alice"
        mock_task.delay.assert_called_once_with(guest_id=str(guest.id))
        assert AuditEvent.objects.filter(action="notifications.telegram_bound").count() == 1

    def test_start_rebound_replaces_existing_binding(
        self, mock_task, mock_reply, client, event, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        g1 = register_guest(
            event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "+1"}
        )
        g2 = register_guest(
            event=event, payload={"name": "B", "email": "b@x.com", "phone_or_chat": "+2"}
        )
        TelegramBinding.objects.create(guest=g1, chat_id=42, username="alice")
        resp = _post(client, _update(f"/start {g2.entry_token}", chat_id=42), secret="secret")
        assert resp.status_code == 200
        assert TelegramBinding.objects.filter(chat_id=42).get().guest == g2
        assert not TelegramBinding.objects.filter(guest=g1).exists()
        assert AuditEvent.objects.filter(action="notifications.telegram_rebound").count() == 1

    def test_non_start_message_gets_generic_reply(
        self, mock_task, mock_reply, client, event, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        resp = _post(client, _update("hello bot"), secret="secret")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_called_once()
        assert "Get on Telegram" in mock_reply.call_args.kwargs["text"]
        assert AuditEvent.objects.filter(action__startswith="notifications.telegram").count() == 0
