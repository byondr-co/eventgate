"""Telegram QR delivery Celery task."""

from __future__ import annotations

import logging

import requests
from celery import shared_task
from django.utils import timezone

from apps.audit.services import write_audit
from apps.common.qr import render_png
from apps.guests.models import Guest
from apps.guests.tasks import send_qr_email_task
from apps.notifications.models import NotificationDispatch, TelegramBinding
from apps.notifications.services import send_photo

logger = logging.getLogger(__name__)


@shared_task(
    name="notifications.send_qr_telegram",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_qr_telegram_task(self, *, guest_id: str) -> str:
    guest = Guest.objects.select_related("event", "organization").get(id=guest_id)
    binding = TelegramBinding.objects.filter(guest=guest).first()
    if not binding:
        if guest.email:
            send_qr_email_task.delay(guest_id=str(guest.id))
        return "skipped:no_binding"

    dispatch = NotificationDispatch.objects.create(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        channel="telegram",
        template="pre_reg_qr",
        recipient=str(binding.chat_id),
        status="queued",
    )

    try:
        png = render_png(guest.entry_token)
        caption = f"Your QR code for {guest.event.name}. Show this at the gate."
        send_photo(chat_id=binding.chat_id, photo_bytes=png, caption=caption)

        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = self.request.retries + 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])

        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="system",
            actor_id="celery",
            action="notifications.telegram_sent",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": binding.chat_id, "dispatch_id": str(dispatch.id)},
        )
    except requests.HTTPError as exc:
        dispatch.status = "failed"
        dispatch.error = f"HTTP {getattr(exc.response, 'status_code', '?')}"
        dispatch.attempts = self.request.retries + 1
        dispatch.save(update_fields=["status", "error", "attempts"])

        if self.request.retries >= self.max_retries:
            write_audit(
                organization=guest.organization,
                event=guest.event,
                guest=guest,
                actor_type="system",
                actor_id="celery",
                action="notifications.telegram_failed",
                result="error",
                entry_token=guest.entry_token,
                details={
                    "chat_id": binding.chat_id,
                    "dispatch_id": str(dispatch.id),
                    "last_error": dispatch.error,
                },
            )
            if guest.email:
                send_qr_email_task.delay(guest_id=str(guest.id))
            raise

        retry_after = 0
        if exc.response is not None:
            retry_after = int(exc.response.headers.get("Retry-After", 0) or 0)
        raise self.retry(exc=exc, countdown=max(retry_after, self.default_retry_delay)) from exc

    return str(dispatch.id)
