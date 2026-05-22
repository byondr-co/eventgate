import csv
import io
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport, Guest
from apps.guests.tasks import process_csv_import_task
from apps.orgs.models import Organization


@pytest.fixture
def import_job(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    company_field = RegistrationField.objects.create(
        event=ev, field_key="company", label_en="Company", required=False
    )

    content = (
        "Name,Email,Phone,Company\n"
        "Alice,alice@x.com,+1,Acme\n"  # valid
        "Bob,bob@x.com,+2,Globex\n"  # valid
        ",charlie@x.com,+3,\n"  # invalid: missing required name
        "Diane,not-an-email,+4,\n"  # invalid: bad email
        "Alice,alice@x.com,+1,Acme\n"  # duplicate of row 1
    )
    f = SimpleUploadedFile("g.csv", content.encode("utf-8"))
    ci = CsvImport.objects.create(
        event=ev,
        uploaded_by=user,
        file=f,
        column_mapping={"0": "name", "1": "email", "2": "phone", "3": str(company_field.id)},
        status="pending",
    )
    return ci, ev, company_field


@pytest.mark.django_db
class TestProcessCsvImportTask:
    def test_processes_mixed_csv_correctly(self, import_job):
        ci, ev, company_field = import_job
        process_csv_import_task(import_id=str(ci.id))
        ci.refresh_from_db()
        assert ci.status == "complete"
        assert ci.total_rows == 5
        assert ci.imported_rows == 2
        assert ci.failed_rows == 3

        guests = Guest.objects.filter(event=ev, source="csv_import")
        assert guests.count() == 2
        alice = guests.get(email="alice@x.com")
        assert alice.full_name == "Alice"
        assert alice.custom_fields.get("company") == "Acme"

        assert AuditEvent.objects.filter(action="guest.created_via_csv").count() == 2

        assert ci.error_report
        ci.error_report.seek(0)
        reader = csv.reader(io.StringIO(ci.error_report.read().decode("utf-8")))
        rows = list(reader)
        assert rows[0] == ["row_number", "raw_data", "errors"]
        assert len(rows) == 4  # header + 3 failures
        assert any("Duplicate" in r[-1] for r in rows[1:])

    @patch("apps.guests.tasks._csv.reader")
    def test_unhandled_exception_flips_status_to_failed(self, mock_reader, import_job):
        ci, _, _ = import_job
        mock_reader.side_effect = RuntimeError("simulated worker crash")
        # Should not propagate — task swallows and records the error
        result = process_csv_import_task(import_id=str(ci.id))
        ci.refresh_from_db()
        assert ci.status == "failed"
        assert "simulated worker crash" in ci.last_error
        # Result string indicates failure
        assert "failed" in result.lower()
