import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.services import filtered_event_guests
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_filtered_event_guests_applies_search_and_filters():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="t1",
        full_name="Ana",
        entry_status="checked_in",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        entry_token="t2",
        full_name="Bob",
        entry_status="registered_not_arrived",
    )

    by_search = filtered_event_guests(organization=org, event_slug="launch", search="ana")
    assert [g.full_name for g in by_search] == ["Ana"]
    by_type = filtered_event_guests(organization=org, event_slug="launch", guest_type="walk_in")
    assert [g.full_name for g in by_type] == ["Bob"]
    by_entry = filtered_event_guests(
        organization=org, event_slug="launch", entry_status="checked_in"
    )
    assert [g.full_name for g in by_entry] == ["Ana"]
