from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import MagicLinkToken
from apps.accounts.services import (
    MagicLinkExpired,
    MagicLinkInvalid,
    consume_magic_link,
    issue_magic_link,
)


@pytest.mark.django_db
class TestIssueMagicLink:
    def test_creates_db_row_and_returns_raw_token(self) -> None:
        raw, token = issue_magic_link(email="alice@example.com")
        assert raw  # raw token returned only once
        assert len(raw) >= 43
        # Stored row exists; the stored hash is NOT the raw token
        assert MagicLinkToken.objects.filter(id=token.id).exists()
        assert token.token_hash != raw

    def test_normalizes_email(self) -> None:
        _, token = issue_magic_link(email="ALICE@Example.com")
        assert token.email == "alice@example.com"

    def test_sets_expiry_15_minutes_from_now(self) -> None:
        before = timezone.now()
        _, token = issue_magic_link(email="alice@example.com")
        after = timezone.now()
        delta = token.expires_at - before
        assert timedelta(minutes=14, seconds=55) < delta < timedelta(minutes=15, seconds=5)
        assert token.expires_at > after

    def test_multiple_tokens_can_exist_for_same_email(self) -> None:
        # No rate limit at MVP — Plan C will add Redis-backed throttling.
        for _ in range(3):
            issue_magic_link(email="alice@example.com")
        assert MagicLinkToken.objects.filter(email="alice@example.com").count() == 3


@pytest.mark.django_db
class TestConsumeMagicLink:
    def test_valid_unused_token_returns_user(self) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        user = consume_magic_link(raw)
        assert user.email == "alice@example.com"

    def test_creates_user_if_not_exists(self) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        assert not User.objects.filter(email="newbie@example.com").exists()
        raw, _ = issue_magic_link(email="newbie@example.com")
        user = consume_magic_link(raw)
        assert user.email == "newbie@example.com"
        assert User.objects.filter(email="newbie@example.com").exists()

    def test_reuses_existing_user_if_exists(self) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        existing = User.objects.create_user(email="alice@example.com", full_name="Alice A.")
        raw, _ = issue_magic_link(email="alice@example.com")
        user = consume_magic_link(raw)
        assert user.id == existing.id

    def test_token_is_single_use(self) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        consume_magic_link(raw)
        with pytest.raises(MagicLinkInvalid):
            consume_magic_link(raw)

    def test_expired_token_rejected(self) -> None:
        raw, token = issue_magic_link(email="alice@example.com")
        token.expires_at = timezone.now() - timedelta(seconds=1)
        token.save(update_fields=["expires_at"])
        with pytest.raises(MagicLinkExpired):
            consume_magic_link(raw)

    def test_unknown_token_rejected(self) -> None:
        with pytest.raises(MagicLinkInvalid):
            consume_magic_link("not-a-real-token")
