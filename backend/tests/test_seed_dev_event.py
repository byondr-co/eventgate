import pytest
from django.core.management import call_command

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.mark.django_db
class TestSeedDevEvent:
    def test_creates_org_event_and_two_guests(self):
        call_command("seed_dev_event")
        assert Organization.objects.filter(slug="dev-acme").exists()
        event = Event.objects.get(slug="dev-conf")
        assert event.registration_open is True
        assert event.walkins_enabled is True
        assert event.walkin_capacity == 10
        guests = Guest.objects.filter(event=event, guest_type="pre_registered")
        assert guests.count() == 2
        # Tokens are printable and unique
        tokens = {g.entry_token for g in guests}
        assert len(tokens) == 2
        for t in tokens:
            assert t and len(t) >= 8  # non-trivial token

    def test_idempotent_rerun(self):
        call_command("seed_dev_event")
        call_command("seed_dev_event")
        assert Organization.objects.filter(slug="dev-acme").count() == 1
        assert Event.objects.filter(slug="dev-conf").count() == 1
        # Guest count stays at 2 — not duplicated by re-run
        event = Event.objects.get(slug="dev-conf")
        assert Guest.objects.filter(event=event, guest_type="pre_registered").count() == 2

    def test_prints_summary_for_operator(self, capsys):
        call_command("seed_dev_event")
        captured = capsys.readouterr()
        assert "dev-acme" in captured.out
        assert "dev-conf" in captured.out
        # Each guest's entry_token printed for the operator to use in scanner / Telegram
        assert "entry_token" in captured.out.lower() or "token:" in captured.out.lower()
