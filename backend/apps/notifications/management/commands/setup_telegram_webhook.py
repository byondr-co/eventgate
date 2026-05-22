"""Register the Telegram webhook URL with the Telegram Bot API.

Idempotent — safe to invoke on every deploy. Skipped gracefully when
TELEGRAM_BOT_TOKEN is unset (e.g., local dev without a bot).
"""

from __future__ import annotations

import requests
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Register the Telegram webhook URL with Telegram."

    def handle(self, *args, **options) -> None:
        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        secret = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
        url = getattr(settings, "TELEGRAM_WEBHOOK_URL", "")

        if not token:
            self.stdout.write("TELEGRAM_BOT_TOKEN not set; skipping webhook registration.")
            return
        if not url:
            self.stdout.write("TELEGRAM_WEBHOOK_URL not set; skipping webhook registration.")
            return

        resp = requests.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={
                "url": url,
                "secret_token": secret,
                "allowed_updates": ["message"],
            },
            timeout=10,
        )
        body = resp.json()
        if resp.status_code != 200 or not body.get("ok"):
            raise RuntimeError(f"setWebhook failed: status={resp.status_code} body={body}")
        self.stdout.write(self.style.SUCCESS(f"Webhook registered: {url}"))
