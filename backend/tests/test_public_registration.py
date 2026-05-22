import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def open_event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(
        organization=org, name="Conf", slug="conf", status="open", registration_open=True
    )
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestPublicRegistration:
    def test_anonymous_can_submit(self, open_event):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+855 12 345 678"},
            format="json",
        )
        assert response.status_code == 201
        body = response.json()
        assert "guest_id" in body
        # entry_token is now exposed so the confirmation page can build a
        # Telegram deep-link CTA (?start=<token>). Safe because the same
        # token is emailed to the same guest at the same moment.
        assert "entry_token" in body
        assert body["entry_token"]
        g = Guest.objects.get(id=body["guest_id"])
        assert g.entry_token == body["entry_token"]
        assert g.entry_status == "registered_not_arrived"
        assert g.info_status == "info_completed"
        assert g.full_name == "Alice"

    def test_missing_required_field_400(self, open_event):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "Alice"},
            format="json",
        )
        assert response.status_code == 400
        assert "email" in response.content.decode().lower()

    def test_closed_event_rejects(self, open_event):
        open_event.registration_open = False
        open_event.save()
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1"},
            format="json",
        )
        assert response.status_code == 403

    def test_unknown_event_404(self):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/no-such-event/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1"},
            format="json",
        )
        assert response.status_code == 404

    def test_custom_field_captured(self, open_event):
        from apps.events.models import RegistrationField

        RegistrationField.objects.create(
            event=open_event,
            field_key="company",
            label_en="Company",
            field_type="text",
            required=False,
            order_index=10,
        )
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1", "company": "Acme Co."},
            format="json",
        )
        assert response.status_code == 201
        g = Guest.objects.get(id=response.json()["guest_id"])
        assert g.custom_fields == {"company": "Acme Co."}
