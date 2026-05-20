import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.events.models import Event
from apps.orgs.models import Organization


@pytest.mark.django_db
class TestEvent:
    def test_create_event(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(organization=org, name="Annual Meetup", slug="annual-meetup")
        assert ev.status == "draft"
        assert ev.registration_open is True
        assert ev.walkins_enabled is True

    def test_slug_unique_per_org(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        Event.objects.create(organization=org, name="A", slug="a")
        with pytest.raises(IntegrityError):
            Event.objects.create(organization=org, name="A again", slug="a")

    def test_slug_can_repeat_across_orgs(self) -> None:
        a = Organization.objects.create(name="A", slug="a")
        b = Organization.objects.create(name="B", slug="b")
        Event.objects.create(organization=a, name="X", slug="x")
        Event.objects.create(organization=b, name="X", slug="x")  # ok

    def test_status_choices_enforced(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event(organization=org, name="A", slug="a", status="banana")
        with pytest.raises(ValidationError):
            ev.full_clean()

    def test_str_returns_name(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(organization=org, name="Annual Meetup", slug="m")
        assert str(ev) == "Annual Meetup"
