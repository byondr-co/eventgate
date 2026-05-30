from datetime import timedelta

from django.conf import settings


def test_access_token_lifetime_is_one_day():
    assert settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"] == timedelta(days=1)


def test_refresh_token_lifetime_is_fourteen_days():
    assert settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] == timedelta(days=14)


def test_rotate_refresh_tokens_enabled():
    assert settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"] is True
