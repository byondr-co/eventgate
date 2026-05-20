import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.orgs.models import Organization


@pytest.fixture
def guest(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return register_guest(
        event=ev,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+855123"},
    )


@pytest.mark.django_db
class TestQrEndpoint:
    def test_returns_png_with_correct_token(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png?token={guest.entry_token}")
        assert response.status_code == 200
        assert response["Content-Type"] == "image/png"
        assert response.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_wrong_token_returns_403(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png?token=wrong")
        assert response.status_code == 403

    def test_missing_token_returns_403(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png")
        assert response.status_code == 403

    def test_unknown_guest_returns_404(self):
        client = APIClient()
        response = client.get(
            "/api/v1/guests/00000000-0000-0000-0000-000000000000/qr.png?token=anything"
        )
        assert response.status_code == 404
