from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.accounts.models import MagicLinkToken


@pytest.mark.django_db
def test_dev_login_issues_token_and_prints_url(settings):
    settings.DEBUG = True
    settings.MAGIC_LINK_FRONTEND_URL = "http://localhost:3000"

    out = StringIO()
    call_command("dev_login", "alice@example.com", stdout=out)
    output = out.getvalue()

    assert "http://localhost:3000/auth/callback?token=" in output
    assert "alice@example.com" in output
    assert MagicLinkToken.objects.filter(email="alice@example.com").count() == 1


def test_dev_login_refuses_when_debug_false(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError) as exc:
        call_command("dev_login", "alice@example.com")
    assert "DEBUG" in str(exc.value)
