import pytest

from apps.audit.models import AuditEvent
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _org():
    return Organization.objects.create(name="O", slug="o")


def _event(org):
    return Event.objects.create(organization=org, name="E", slug="e")


def test_write_audit_creates_row():
    org = _org()
    ev = _event(org)
    row = write_audit(
        organization=org,
        event=ev,
        actor_type="system",
        actor_id="system",
        action="checkin.success",
        result="success",
        previous_status="registered_not_arrived",
        new_status="checked_in",
        gate="Gate 1",
        scanner="Lane A",
        details={"client_idempotency_key": "abc"},
    )
    assert AuditEvent.objects.count() == 1
    assert row.action == "checkin.success"
    assert row.organization_id == org.id
    assert row.event_id == ev.id
    assert row.details_json == {"client_idempotency_key": "abc"}


def test_audit_action_required():
    org = _org()
    ev = _event(org)
    with pytest.raises(ValueError):
        write_audit(
            organization=org,
            event=ev,
            actor_type="system",
            actor_id="x",
            action="",
            result="success",
        )


def test_audit_result_choices():
    org = _org()
    ev = _event(org)
    with pytest.raises(ValueError):
        write_audit(
            organization=org,
            event=ev,
            actor_type="system",
            actor_id="x",
            action="x",
            result="bogus",
        )
