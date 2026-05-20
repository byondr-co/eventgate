import pytest
from django.urls import path
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.authentication import CookieJWTAuthentication


class _Echo(APIView):
    authentication_classes = (CookieJWTAuthentication,)

    def get(self, request):
        return Response({"email": request.user.email})


# Local URLconf for tests
urlpatterns = [path("echo/", _Echo.as_view())]


@pytest.fixture
def url_override(settings):
    settings.ROOT_URLCONF = __name__


@pytest.mark.django_db
class TestCookieJWTAuthentication:
    def test_authenticates_via_access_cookie(self, url_override, settings, django_user_model):
        user = django_user_model.objects.create_user(email="alice@example.com")
        access = str(RefreshToken.for_user(user).access_token)

        client = APIClient()
        client.cookies[settings.JWT_ACCESS_COOKIE] = access
        response = client.get("/echo/")
        assert response.status_code == 200
        assert response.json() == {"email": "alice@example.com"}

    def test_no_cookie_returns_401(self, url_override):
        client = APIClient()
        response = client.get("/echo/")
        assert response.status_code == 401

    def test_invalid_cookie_returns_401(self, url_override, settings):
        client = APIClient()
        client.cookies[settings.JWT_ACCESS_COOKIE] = "not-a-jwt"
        response = client.get("/echo/")
        assert response.status_code == 401

    def test_authorization_header_still_works(self, url_override, django_user_model):
        user = django_user_model.objects.create_user(email="bob@example.com")
        access = str(RefreshToken.for_user(user).access_token)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = client.get("/echo/")
        assert response.status_code == 200
