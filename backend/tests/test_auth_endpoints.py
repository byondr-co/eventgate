import pytest
from rest_framework.test import APIClient

from apps.accounts.models import MagicLinkToken
from apps.accounts.services import issue_magic_link


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
class TestRequestMagicLink:
    def test_request_creates_token_and_returns_204(self, client) -> None:
        response = client.post(
            "/api/v1/auth/magic-link/request/", {"email": "alice@example.com"}, format="json"
        )
        assert response.status_code == 204
        assert MagicLinkToken.objects.filter(email="alice@example.com").count() == 1

    def test_request_does_not_leak_user_existence(self, client) -> None:
        r1 = client.post(
            "/api/v1/auth/magic-link/request/", {"email": "newbie@example.com"}, format="json"
        )
        r2 = client.post(
            "/api/v1/auth/magic-link/request/", {"email": "newbie@example.com"}, format="json"
        )
        assert r1.status_code == r2.status_code == 204

    def test_request_rejects_missing_email(self, client) -> None:
        response = client.post("/api/v1/auth/magic-link/request/", {}, format="json")
        assert response.status_code == 400

    def test_request_rejects_invalid_email(self, client) -> None:
        response = client.post(
            "/api/v1/auth/magic-link/request/", {"email": "not-an-email"}, format="json"
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestConsumeMagicLink:
    def test_consume_returns_user_and_sets_cookies(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        response = client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        assert response.status_code == 200
        body = response.json()
        assert body["user"]["email"] == "alice@example.com"
        assert settings.JWT_ACCESS_COOKIE in response.cookies
        assert settings.JWT_REFRESH_COOKIE in response.cookies
        assert response.cookies[settings.JWT_ACCESS_COOKIE]["httponly"] is True

    def test_consume_invalid_token_returns_400(self, client) -> None:
        response = client.post(
            "/api/v1/auth/magic-link/consume/", {"token": "garbage"}, format="json"
        )
        assert response.status_code == 400

    def test_consume_used_token_returns_400(self, client) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        response = client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        assert response.status_code == 400


@pytest.mark.django_db
class TestMeEndpoint:
    def test_authenticated_user_gets_profile(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == 200
        assert response.json()["email"] == "alice@example.com"

    def test_unauthenticated_returns_401(self, client) -> None:
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestLogout:
    def test_logout_clears_cookies(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")

        response = client.post("/api/v1/auth/logout/")
        assert response.status_code == 204
        assert response.cookies[settings.JWT_ACCESS_COOKIE].value == ""
        assert response.cookies[settings.JWT_REFRESH_COOKIE].value == ""
