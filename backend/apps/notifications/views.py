"""Telegram webhook endpoint."""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.audit.services import write_audit
from apps.guests.models import Guest
from apps.notifications.models import TelegramBinding
from apps.notifications.services import send_message
from apps.notifications.tasks import send_qr_telegram_task

logger = logging.getLogger(__name__)


def _generic_reply() -> str:
    return (
        "Hi! To receive your QR code, please use the 'Get on Telegram' button on your event "
        "registration confirmation page."
    )


@csrf_exempt
@require_POST
def telegram_webhook(request: HttpRequest) -> HttpResponse:
    expected = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
    received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not expected or received != expected:
        logger.warning("telegram_webhook: secret mismatch")
        return JsonResponse({"ok": True})

    try:
        update: dict[str, Any] = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        logger.warning("telegram_webhook: malformed body")
        return JsonResponse({"ok": True})

    message = update.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    username = (message.get("from") or {}).get("username", "") or ""
    text = (message.get("text") or "").strip()

    if not chat_id or not text:
        return JsonResponse({"ok": True})

    if text.startswith("/start "):
        token = text[len("/start ") :].strip()
        _handle_start(chat_id=chat_id, username=username, token=token)
    else:
        send_message(chat_id=chat_id, text=_generic_reply())

    return JsonResponse({"ok": True})


def _handle_start(*, chat_id: int, username: str, token: str) -> None:
    try:
        guest = Guest.objects.select_related("event__organization").get(entry_token=token)
    except Guest.DoesNotExist:
        send_message(
            chat_id=chat_id,
            text="Sorry, this link is no longer valid. Please contact your event organizer.",
        )
        write_audit(
            organization=None,
            event=None,
            guest=None,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_unknown_start",
            result="warning",
            entry_token=token[:8],
            details={"chat_id": chat_id},
        )
        return

    existing = TelegramBinding.objects.filter(chat_id=chat_id).first()
    if existing and existing.guest_id != guest.id:
        previous_guest_id = str(existing.guest_id)
        existing.delete()
        TelegramBinding.objects.filter(guest=guest).delete()
        TelegramBinding.objects.create(guest=guest, chat_id=chat_id, username=username)
        write_audit(
            organization=guest.event.organization,
            event=guest.event,
            guest=guest,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_rebound",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": chat_id, "previous_guest_id": previous_guest_id},
        )
    elif not existing:
        TelegramBinding.objects.filter(guest=guest).delete()
        TelegramBinding.objects.create(guest=guest, chat_id=chat_id, username=username)
        write_audit(
            organization=guest.event.organization,
            event=guest.event,
            guest=guest,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_bound",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": chat_id, "username": username},
        )
    # else: binding already matches this guest — no-op binding-wise; still enqueue resend below.

    send_qr_telegram_task.delay(guest_id=str(guest.id))
