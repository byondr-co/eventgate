import pytest

from apps.devices.services import create_device
from apps.events.models import Event
from apps.orgs.models import Organization


@pytest.fixture
def org_event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    return org, ev


@pytest.mark.django_db
class TestCreateDeviceRoleValidation:
    def test_accepts_valid_roles(self, org_event):
        org, ev = org_event
        for role in ("scanner", "walkin_display", "helpdesk"):
            d, code = create_device(organization=org, event=ev, label=f"D-{role}", role=role)
            assert d.role == role
            assert code

    def test_rejects_unknown_role(self, org_event):
        org, ev = org_event
        with pytest.raises(ValueError) as exc:
            create_device(organization=org, event=ev, label="D-bad", role="checkin")
        assert "role" in str(exc.value).lower()
        assert "checkin" in str(exc.value) or "scanner" in str(exc.value)
