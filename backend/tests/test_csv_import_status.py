import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def status_ready(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    client = APIClient()
    client.force_authenticate(user=user)
    ci = CsvImport.objects.create(
        event=ev,
        uploaded_by=user,
        file=SimpleUploadedFile("g.csv", b"Name,Email\nA,a@x.com\n"),
        column_mapping={"0": "name", "1": "email"},
        status="running",
        total_rows=10,
        imported_rows=7,
        failed_rows=2,
    )
    return client, org, ev, ci


@pytest.mark.django_db
class TestCsvImportStatus:
    def test_get_returns_progress(self, status_ready):
        client, org, ev, ci = status_ready
        resp = client.get(f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/{ci.id}/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "running"
        assert body["total_rows"] == 10
        assert body["imported_rows"] == 7
        assert body["failed_rows"] == 2
        assert body["error_report_url"] is None

    def test_get_includes_error_report_url_when_set(self, status_ready):
        from django.core.files.base import ContentFile

        client, org, ev, ci = status_ready
        ci.error_report.save("err.csv", ContentFile(b"row_number,errors\n2,bad\n"))
        resp = client.get(f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/{ci.id}/")
        assert resp.status_code == 200
        assert resp.json()["error_report_url"] is not None
