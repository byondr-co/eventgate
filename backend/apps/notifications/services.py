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
