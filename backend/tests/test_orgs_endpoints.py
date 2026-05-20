import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.orgs.models import Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
class TestListOrgs:
    def test_returns_only_orgs_user_is_member_of(self, client) -> None:
        _login(client, "alice@example.com")
        from django.contrib.auth import get_user_model

        User = get_user_model()
        alice = User.objects.get(email="alice@example.com")

        a = Organization.objects.create(name="Alpha", slug="alpha")
        Organization.objects.create(name="Bravo", slug="bravo")  # alice not a member
        OrganizationMembership.objects.create(user=alice, organization=a, role="owner")

        response = client.get("/api/v1/orgs/")
        assert response.status_code == 200
        slugs = [o["slug"] for o in response.json()["results"]]
        assert slugs == ["alpha"]

    def test_unauth_returns_401(self, client) -> None:
        response = client.get("/api/v1/orgs/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestCreateOrg:
    def test_creates_org_and_makes_user_owner(self, client) -> None:
        _login(client, "alice@example.com")
        response = client.post("/api/v1/orgs/", {"name": "Cambodia Tech"}, format="json")
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Cambodia Tech"
        assert body["slug"] == "cambodia-tech"
        org = Organization.objects.get(slug="cambodia-tech")
        m = OrganizationMembership.objects.get(organization=org, user__email="alice@example.com")
        assert m.role == "owner"

    def test_slug_collision_appends_suffix(self, client) -> None:
        _login(client, "alice@example.com")
        Organization.objects.create(name="Existing", slug="cambodia-tech")
        response = client.post("/api/v1/orgs/", {"name": "Cambodia Tech"}, format="json")
        assert response.status_code == 201
        assert response.json()["slug"].startswith("cambodia-tech-")


@pytest.mark.django_db
class TestRetrieveOrg:
    def test_member_can_get_detail(self, client) -> None:
        _login(client, "alice@example.com")
        client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
        response = client.get("/api/v1/orgs/acme/")
        assert response.status_code == 200
        assert response.json()["slug"] == "acme"

    def test_non_member_gets_404(self, client) -> None:
        _login(client, "alice@example.com")
        Organization.objects.create(name="Other", slug="other")
        response = client.get("/api/v1/orgs/other/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestMembersList:
    def test_owner_sees_all_members(self, client) -> None:
        _login(client, "alice@example.com")
        client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
        # Send + accept invite for bob via service (consistent with Task 11 refactor)
        from django.contrib.auth import get_user_model

        from apps.orgs.services import send_invite

        User = get_user_model()
        alice = User.objects.get(email="alice@example.com")
        acme = Organization.objects.get(slug="acme")
        invite = send_invite(
            organization=acme, email="bob@example.com", role="admin", invited_by=alice
        )
        bob = APIClient()
        _login(bob, "bob@example.com")
        bob.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")

        response = client.get("/api/v1/orgs/acme/members/")
        assert response.status_code == 200
        emails = sorted(m["user_email"] for m in response.json()["results"])
        assert emails == ["alice@example.com", "bob@example.com"]

    def test_non_member_gets_404(self, client) -> None:
        _login(client, "outsider@example.com")
        Organization.objects.create(name="Acme", slug="acme")
        response = client.get("/api/v1/orgs/acme/members/")
        assert response.status_code == 404
