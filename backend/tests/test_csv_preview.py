import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def auth_client(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    RegistrationField.objects.create(
        event=ev, field_key="company", label_en="Company", required=False
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, ev


def _csv_file(content: str, name: str = "guests.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")


@pytest.mark.django_db
class TestCsvPreview:
    def test_happy_path_returns_auto_mapping_and_creates_preview_row(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("Name,Email,Company\nAlice,alice@x.com,Acme\nBob,bob@x.com,Globex\n")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
        )
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["headers"] == ["Name", "Email", "Company"]
        assert body["first_rows"] == [
            ["Alice", "alice@x.com", "Acme"],
            ["Bob", "bob@x.com", "Globex"],
        ]
        assert body["auto_mapping"] == {"0": "name", "1": "email", "2": None}
        assert any(rf["label"] == "Company" for rf in body["registration_fields"])
        assert CsvImport.objects.filter(event=ev, status="preview").count() == 1
        assert body["preview_id"] == str(CsvImport.objects.get(event=ev, status="preview").id)

    def test_empty_file_returns_400(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
        )
        assert resp.status_code == 400

    def test_header_only_returns_400(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("Name,Email\n")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
        )
        assert resp.status_code == 400
