import pytest
from django.contrib.auth import get_user_model
from django.urls import include, path
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.common.permissions import IsOrgMember
from apps.orgs.models import Organization, OrganizationMembership

User = get_user_model()


class _OrgScopedView(viewsets.ViewSet):
    permission_classes = (permissions.IsAuthenticated, IsOrgMember)

    def list(self, request, org_slug=None):
        # IsOrgMember sets request.organization
        return Response({"org": request.organization.slug, "role": request.org_role})


urlpatterns = [
    path("orgs/<slug:org_slug>/echo/", _OrgScopedView.as_view({"get": "list"})),
    # Include auth URLs so _login() can consume magic-link tokens
    path("api/v1/", include("apps.accounts.urls")),
]


@pytest.fixture
def url_override(settings):
    settings.ROOT_URLCONF = __name__


def _login(client, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.mark.django_db
class TestIsOrgMember:
    def test_member_can_access(self, url_override) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(user=user, organization=org, role="admin")

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 200
        assert response.json() == {"org": "acme", "role": "admin"}

    def test_non_member_gets_404(self, url_override) -> None:
        User.objects.create_user(email="alice@example.com")
        Organization.objects.create(name="Acme", slug="acme")

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        # 404 (not 403) — do not reveal that the org exists
        assert response.status_code == 404

    def test_unauthenticated_gets_401(self, url_override) -> None:
        Organization.objects.create(name="Acme", slug="acme")
        client = APIClient()
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 401

    def test_inactive_membership_blocked(self, url_override) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(
            user=user, organization=org, role="admin", is_active=False
        )

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 404
