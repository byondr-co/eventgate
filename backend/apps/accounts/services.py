"""Magic-link lifecycle: issue, send, consume."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import MagicLinkToken
from apps.common.tokens import generate_token, hash_token, tokens_match

User = get_user_model()


class MagicLinkError(Exception):
    """Base."""


class MagicLinkInvalid(MagicLinkError):
    pass


class MagicLinkExpired(MagicLinkError):
    pass


def issue_magic_link(
    *, email: str, requested_from_ip: str | None = None
) -> tuple[str, MagicLinkToken]:
    """Create a fresh magic-link token and return (raw_token, db_row).

    The raw token is shown to the user (via email) exactly once. Only the hash
    persists.
    """
    email_normalized = email.strip().lower()
    raw = generate_token()
    token = MagicLinkToken.objects.create(
        email=email_normalized,
        token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(minutes=settings.MAGIC_LINK_TTL_MINUTES),
        requested_from_ip=requested_from_ip,
    )
    return raw, token


def send_magic_link_email(*, email: str, raw_token: str) -> None:
    """Enqueue the magic-link email send. Tests with CELERY_TASK_ALWAYS_EAGER=True
    will execute it synchronously, which is what test_magic_link_service.py expects."""
    from apps.accounts.tasks import send_magic_link_email_task

    send_magic_link_email_task.delay(email=email, raw_token=raw_token)


@transaction.atomic
def consume_magic_link(raw_token: str) -> User:  # type: ignore[valid-type]
    """Validate and consume a magic-link token, returning the (possibly-new) user."""
    if not raw_token:
        raise MagicLinkInvalid("Empty token")

    token_hash = hash_token(raw_token)
    try:
        token = MagicLinkToken.objects.select_for_update().get(token_hash=token_hash)
    except MagicLinkToken.DoesNotExist as exc:
        raise MagicLinkInvalid("Unknown token") from exc

    if not tokens_match(raw_token, token.token_hash):
        # Defense in depth — get() already matched by hash, but verify anyway
        raise MagicLinkInvalid("Token mismatch")

    if token.is_consumed:
        raise MagicLinkInvalid("Token already used")

    if token.expires_at <= timezone.now():
        raise MagicLinkExpired("Token expired")

    # Route new-user creation through the manager so set_unusable_password()
    # runs. Plain get_or_create would bypass UserManager.create_user and leave
    # the password field as an empty string (technically usable).
    try:
        user = User.objects.get(email=token.email)
    except User.DoesNotExist:
        user = User.objects.create_user(email=token.email)
    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at", "updated_at"])

    token.consumed_at = timezone.now()
    token.save(update_fields=["consumed_at"])

    return user
