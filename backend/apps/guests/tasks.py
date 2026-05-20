"""QR delivery Celery task."""

from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from apps.common.qr import render_png
from apps.guests.models import Guest
from apps.notifications.models import NotificationDispatch


@shared_task(name="guests.send_qr_email", bind=True, max_retries=3, default_retry_delay=60)
def send_qr_email_task(self, *, guest_id: str) -> str:
    guest = Guest.objects.select_related("event", "organization").get(id=guest_id)
    if not guest.email:
        return "skipped:no_email"

    dispatch = NotificationDispatch.objects.create(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        channel="email",
        template="pre_reg_qr",
        recipient=guest.email,
        status="queued",
    )

    try:
        png = render_png(guest.entry_token)
        body = (
            f"Hi {guest.full_name or 'there'},\n\n"
            f"You're registered for {guest.event.name}.\n\n"
            "Show the attached QR code at the entrance — staff will scan it.\n"
            "Keep it private; do not share.\n\n"
            "See you there!\n"
            "— Eventgate"
        )
        msg = EmailMessage(
            subject=f"You're registered for {guest.event.name}",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[guest.email],
        )
        msg.attach(f"eventgate-{guest.id}.png", png, "image/png")
        msg.send(fail_silently=False)

        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])
    except Exception as exc:
        dispatch.status = "failed"
        dispatch.error = str(exc)
        dispatch.attempts += 1
        dispatch.save(update_fields=["status", "error", "attempts"])
        raise self.retry(exc=exc) from exc

    return str(dispatch.id)
