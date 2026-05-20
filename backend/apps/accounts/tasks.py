"""Email tasks for accounts (magic-link)."""

from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import NotificationDispatch


@shared_task(name="accounts.send_magic_link_email")
def send_magic_link_email_task(*, email: str, raw_token: str) -> str:
    dispatch = NotificationDispatch.objects.create(
        channel="email",
        template="magic_link",
        recipient=email,
        status="queued",
    )
    try:
        link = f"{settings.MAGIC_LINK_FRONTEND_URL}/auth/callback?token={raw_token}"
        send_mail(
            subject="Sign in to Eventgate",
            message=(
                "Click the link below to sign in. It works once and expires in 15 minutes.\n\n"
                f"{link}\n\n"
                "If you didn't request this, you can ignore the email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])
    except Exception as exc:
        dispatch.status = "failed"
        dispatch.error = str(exc)
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "error", "attempts"])
        raise
    return str(dispatch.id)
