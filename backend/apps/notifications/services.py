"""Telegram Bot API helpers — thin HTTP wrappers."""

from __future__ import annotations

import requests
from django.conf import settings


def send_photo(
    *, chat_id: int, photo_bytes: bytes, caption: str = "", filename: str = "qr.png"
) -> None:
    """Send a photo (raw bytes) via Telegram. Raises requests.HTTPError on non-200.

    Caller decides retry. No-op in dev/test when TELEGRAM_BOT_TOKEN is unset.
    """
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return
    resp = requests.post(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data={"chat_id": chat_id, "caption": caption},
        files={"photo": (filename, photo_bytes, "image/png")},
        timeout=15,
    )
    if resp.status_code != 200:
        raise requests.HTTPError(response=resp)


def send_message(*, chat_id: int, text: str) -> None:
    """Send a text message via Telegram. Logs and swallows errors — non-fatal."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return  # no-op in dev/test without token
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
    except requests.RequestException:
        # Reply failures shouldn't break the webhook — webhook still returns 200.
        pass
