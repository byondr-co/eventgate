"""DRF authentication class that reads JWT from an httpOnly cookie.

Falls back to the Authorization header (so curl + tests with .credentials()
keep working).
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """Auth via cookie first, then Authorization header."""

    def authenticate(self, request: Request):
        raw = request.COOKIES.get(settings.JWT_ACCESS_COOKIE)
        if raw:
            try:
                validated = self.get_validated_token(raw)
            except (InvalidToken, TokenError) as exc:
                raise AuthenticationFailed("Invalid token") from exc
            return self.get_user(validated), validated
        # Fall back to header
        return super().authenticate(request)
