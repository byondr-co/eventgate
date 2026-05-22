from unittest.mock import patch

import pytest
from django.core.management import call_command


@pytest.mark.django_db
@patch("apps.notifications.management.commands.setup_telegram_webhook.requests.post")
def test_setup_webhook_posts_correct_payload(mock_post, settings):
    settings.TELEGRAM_BOT_TOKEN = "test_token"
    settings.TELEGRAM_WEBHOOK_SECRET = "test_secret"
    settings.TELEGRAM_WEBHOOK_URL = "https://example.com/api/v1/telegram/webhook/"
    mock_post.return_value.json.return_value = {"ok": True}
    mock_post.return_value.status_code = 200

    call_command("setup_telegram_webhook")

    mock_post.assert_called_once_with(
        "https://api.telegram.org/bottest_token/setWebhook",
        json={
            "url": "https://example.com/api/v1/telegram/webhook/",
            "secret_token": "test_secret",
            "allowed_updates": ["message"],
        },
        timeout=10,
    )


@patch("apps.notifications.management.commands.setup_telegram_webhook.requests.post")
def test_setup_webhook_skips_when_token_missing(mock_post, settings, capsys):
    settings.TELEGRAM_BOT_TOKEN = ""
    call_command("setup_telegram_webhook")
    mock_post.assert_not_called()
    captured = capsys.readouterr()
    assert "TELEGRAM_BOT_TOKEN not set" in captured.out
