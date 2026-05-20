import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.orgs.models import Invite, Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def acme_with_alice_owner(client):
    _login(client, "alice@example.com")
    client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
    return Organization.objects.get(slug="acme")


@pytest.mark.django_db
class TestSendInvite:
    def test_owner_can_invite(self, client, acme_with_alice_owner) -> None:
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 201
        assert Invite.objects.filter(
            organization=acme_with_alice_owner, email="bob@example.com"
        ).exists()

    def test_non_member_cannot_invite(self, client) -> None:
        Organization.objects.create(name="Acme", slug="acme")
        _login(client, "outsider@example.com")
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 404

    def test_staff_cannot_invite(self, client) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        _login(client, "alice@example.com")
        alice = User.objects.get(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(user=alice, organization=org, role="staff")
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 403

    def test_invite_to_existing_member_rejected(self, client, acme_with_alice_owner) -> None:
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "alice@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestAcceptInvite:
    def test_recipient_can_accept_after_magic_link(self, client, acme_with_alice_owner) -> None:
        client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")

        bob_client = APIClient()
        _login(bob_client, "bob@example.com")

        accept = bob_client.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert accept.status_code == 200
        assert OrganizationMembership.objects.filter(
            organization=acme_with_alice_owner, user__email="bob@example.com", role="admin"
        ).exists()

    def test_accept_with_wrong_email_returns_403(self, client, acme_with_alice_owner) -> None:
        client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")

        wrong = APIClient()
        _login(wrong, "charlie@example.com")
        response = wrong.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert response.status_code == 403

    def test_expired_invite_rejected(self, client, acme_with_alice_owner) -> None:
        from datetime import timedelta

        client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")
        invite.expires_at = timezone.now() - timedelta(seconds=1)
        invite.save()

        bob = APIClient()
        _login(bob, "bob@example.com")
        response = bob.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert response.status_code == 400
