import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf")


@pytest.mark.django_db
class TestGuest:
    def test_create_pre_registered_guest(self, event):
        g = Guest.objects.create(
            organization=event.organization,
            event=event,
            guest_type="pre_registered",
            entry_token="abc123",
            entry_status="registered_not_arrived",
            email="alice@example.com",
            full_name="Alice",
        )
        assert g.entry_status == "registered_not_arrived"
        assert g.info_status == "info_completed"
        assert g.checked_in_at is None

    def test_entry_token_unique_per_event(self, event):
        from django.db import IntegrityError

        Guest.objects.create(
            organization=event.organization,
            event=event,
            guest_type="pre_registered",
            entry_token="dup",
            entry_status="registered_not_arrived",
        )
        with pytest.raises(IntegrityError):
            Guest.objects.create(
                organization=event.organization,
                event=event,
                guest_type="pre_registered",
                entry_token="dup",
                entry_status="registered_not_arrived",
            )

    def test_same_token_ok_across_events(self, event):
        other = Event.objects.create(organization=event.organization, name="Other", slug="other")
        Guest.objects.create(
            organization=event.organization,
            event=event,
            guest_type="pre_registered",
            entry_token="t",
            entry_status="registered_not_arrived",
        )
        Guest.objects.create(
            organization=event.organization,
            event=other,
            guest_type="pre_registered",
            entry_token="t",
            entry_status="registered_not_arrived",
        )

    def test_custom_fields_jsonb(self, event):
        g = Guest.objects.create(
            organization=event.organization,
            event=event,
            guest_type="pre_registered",
            entry_token="t",
            entry_status="registered_not_arrived",
            custom_fields={"company": "Acme Co.", "notes": "VIP"},
        )
        g.refresh_from_db()
        assert g.custom_fields["company"] == "Acme Co."
