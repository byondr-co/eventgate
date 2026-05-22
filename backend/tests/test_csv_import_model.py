import pytest

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import CsvImport
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)


@pytest.mark.django_db
class TestCsvImport:
    def test_create_preview_row(self, event):
        user = User.objects.create_user(email="u@x.com", password="x")
        ci = CsvImport.objects.create(
            event=event, uploaded_by=user, column_mapping={}, status="preview"
        )
        assert ci.organization == event.organization
        assert ci.status == "preview"
        assert ci.total_rows == 0
        assert ci.imported_rows == 0
        assert ci.failed_rows == 0
        assert ci.created_at is not None
        assert ci.completed_at is None
