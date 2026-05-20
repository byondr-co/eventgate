"""Auth endpoints: request / consume / me / logout."""

from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.serializers import (
    MagicLinkConsumeSerializer,
    MagicLinkRequestSerializer,
    UserSerializer,
)
from apps.accounts.services import (
    MagicLinkError,
    consume_magic_link,
    issue_magic_link,
    send_magic_link_email,
)


def _set_jwt_cookies(response: Response, user) -> Response:
    refresh = RefreshToken.for_user(user)
    access = str(refresh.access_token)
    response.set_cookie(
        settings.JWT_ACCESS_COOKIE,
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        path="/",
    )
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        path="/",
    )
    return response


class MagicLinkRequestView(APIView):
    """POST /api/v1/auth/magic-link/request/  body: {email}"""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request) -> Response:
        serializer = MagicLinkRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        ip = request.META.get("REMOTE_ADDR")
        raw, _ = issue_magic_link(email=email, requested_from_ip=ip)
        send_magic_link_email(email=email, raw_token=raw)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MagicLinkConsumeView(APIView):
    """POST /api/v1/auth/magic-link/consume/  body: {token}"""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request) -> Response:
        serializer = MagicLinkConsumeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw = serializer.validated_data["token"]
        try:
            user = consume_magic_link(raw)
        except MagicLinkError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response = Response({"user": UserSerializer(user).data}, status=status.HTTP_200_OK)
        return _set_jwt_cookies(response, user)


class MeView(APIView):
    """GET /api/v1/auth/me/ — current user."""

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — clear cookies."""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request) -> Response:
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.JWT_ACCESS_COOKIE, path="/")
        response.delete_cookie(settings.JWT_REFRESH_COOKIE, path="/")
        return response
