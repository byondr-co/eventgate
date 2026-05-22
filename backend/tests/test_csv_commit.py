from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
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
        column_mapping={},
        status="preview",
    )
    return client, org, ev, ci


@pytest.mark.django_db
@patch("apps.guests.views.process_csv_import_task")
class TestCsvCommit:
    def test_happy_path_transitions_and_enqueues(self, mock_task, setup):
        client, org, ev, ci = setup
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": str(ci.id), "column_mapping": {"0": "name", "1": "email"}},
            format="json",
        )
        assert resp.status_code == 201, resp.json()
        ci.refresh_from_db()
        assert ci.status == "pending"
        assert ci.column_mapping == {"0": "name", "1": "email"}
        mock_task.delay.assert_called_once_with(import_id=str(ci.id))

    def test_invalid_preview_id_returns_404(self, mock_task, setup):
        client, org, ev, ci = setup
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": "00000000-0000-0000-0000-000000000000", "column_mapping": {}},
            format="json",
        )
        assert resp.status_code == 404
        mock_task.delay.assert_not_called()

    def test_already_committed_preview_returns_409(self, mock_task, setup):
        client, org, ev, ci = setup
        ci.status = "pending"
        ci.save(update_fields=["status"])
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": str(ci.id), "column_mapping": {}},
            format="json",
        )
        assert resp.status_code == 409
        mock_task.delay.assert_not_called()
