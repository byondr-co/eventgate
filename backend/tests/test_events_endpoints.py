import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def acme(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    alice = User.objects.create_user(email="alice@example.com")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(user=alice, organization=org, role="admin")
    return org


@pytest.mark.django_db
class TestCreateEvent:
    def test_admin_can_create(self, acme):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/",
            {"name": "Conf 2026", "slug": "conf-2026"},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["slug"] == "conf-2026"
        ev = Event.objects.get(slug="conf-2026")
        keys = sorted(ev.registration_fields.values_list("field_key", flat=True))
        assert keys == ["email", "name", "phone_or_chat"]

    def test_staff_cannot_create(self, acme):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        bob = User.objects.create_user(email="bob@example.com")
        OrganizationMembership.objects.create(user=bob, organization=acme, role="staff")
        client = APIClient()
        _login(client, "bob@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/", {"name": "X", "slug": "x"}, format="json"
        )
        assert response.status_code == 403

    def test_non_member_gets_404(self):
        Organization.objects.create(name="Other", slug="other")
        client = APIClient()
        _login(client, "outsider@example.com")
        response = client.post(
            "/api/v1/orgs/other/events/", {"name": "X", "slug": "x"}, format="json"
        )
        assert response.status_code == 404


@pytest.mark.django_db
class TestListEvents:
    def test_lists_only_org_events(self, acme):
        Event.objects.create(organization=acme, name="A", slug="a")
        other = Organization.objects.create(name="Other", slug="other")
        Event.objects.create(organization=other, name="B", slug="b")

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/api/v1/orgs/acme/events/")
        assert response.status_code == 200
        slugs = sorted(e["slug"] for e in response.json()["results"])
        assert slugs == ["a"]


@pytest.mark.django_db
class TestRetrieveAndUpdate:
    def test_get_detail_and_update(self, acme):
        ev = Event.objects.create(organization=acme, name="A", slug="a")
        client = APIClient()
        _login(client, "alice@example.com")

        detail = client.get(f"/api/v1/orgs/acme/events/{ev.slug}/")
        assert detail.status_code == 200
        assert detail.json()["name"] == "A"

        patch = client.patch(
            f"/api/v1/orgs/acme/events/{ev.slug}/", {"venue": "Diamond Island"}, format="json"
        )
        assert patch.status_code == 200
        ev.refresh_from_db()
        assert ev.venue == "Diamond Island"
