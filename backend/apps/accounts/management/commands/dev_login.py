"""Dev-only helper: issue a magic-link token and print the full URL to stdout.

Bypasses the Celery + console-email pipeline so devs don't have to dig through
worker logs. Refuses to run when DEBUG is False — this command exists for
local iteration only.

Usage:
    uv run python manage.py dev_login admin@dev.gatethres.local
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Issue a magic-link token and print the sign-in URL (DEBUG-only)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("email", help="Email address to sign in as.")

    def handle(self, *args, email: str, **options) -> None:
        if not settings.DEBUG:
            raise CommandError("dev_login is disabled when DEBUG=False.")

        # Imported lazily so the command file can be discovered without
        # triggering DB lookups at module import time.
        from apps.accounts.services import issue_magic_link

        raw, token = issue_magic_link(email=email)
        url = f"{settings.MAGIC_LINK_FRONTEND_URL}/auth/callback?token={raw}"

        self.stdout.write("")
        self.stdout.write("=" * 70)
        self.stdout.write(url)
        self.stdout.write("=" * 70)
        self.stdout.write(f"email:      {email}")
        self.stdout.write(f"expires at: {token.expires_at.isoformat()}")
