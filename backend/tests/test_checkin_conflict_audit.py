"""When a duplicate checkin originates from a different device/gate, emit a
separate checkin.conflict audit row in addition to the standard
checkin.duplicate row. Plan F's help-desk inbox reads this signal."""

from __future__ import annotations

import pytest

from apps.audit.models import AuditEvent
from apps.checkins.services import CheckinFailure, perform_checkin
from apps.common.tokens import hash_token
from apps.devices.models import ScannerDevice
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def event_with_two_devices(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    a = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate 1",
        role="scanner",
        device_token_hash=hash_token("a"),
    )
    b = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate 2",
        role="scanner",
        device_token_hash=hash_token("b"),
    )
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="Alice",
        email="a@example.com",
        entry_token="raw-token",
        entry_status="registered_not_arrived",
    )
    return org, event, a, b, guest


@pytest.mark.django_db
def test_conflict_audit_when_second_device_replays(event_with_two_devices):
    _org, _event, a, b, _guest = event_with_two_devices

    # First device checks Alice in.
    body, code = perform_checkin(
        device=a,
        token="raw-token",
        gate="Gate 1",
        scanner_label="Gate 1",
        client_idempotency_key="key-a",
    )
    assert code == 200

    # Second device replays an offline mutation against the same token.
    with pytest.raises(CheckinFailure) as exc_info:
        perform_checkin(
            device=b,
            token="raw-token",
            gate="Gate 2",
            scanner_label="Gate 2",
            client_idempotency_key="key-b",
        )
    assert exc_info.value.http_status == 409

    # Both rows present.
    actions = list(
        AuditEvent.objects.filter(entry_token__startswith="raw-token")
        .order_by("occurred_at")
        .values_list("action", flat=True)
    )
    assert actions == ["checkin.success", "checkin.duplicate", "checkin.conflict"]

    conflict = AuditEvent.objects.get(action="checkin.conflict")
    assert conflict.result == "warning"
    assert conflict.actor_id == str(b.id)
    assert conflict.gate == "Gate 2"
    assert conflict.details_json["original_gate"] == "Gate 1"
    assert conflict.details_json["original_scanner"] == "Gate 1"


@pytest.mark.django_db
def test_no_conflict_audit_when_same_device_replays(event_with_two_devices):
    """Same device + same gate replaying = self-replay, no conflict row."""
    _org, _event, a, _b, _guest = event_with_two_devices

    body, code = perform_checkin(
        device=a,
        token="raw-token",
        gate="Gate 1",
        scanner_label="Gate 1",
        client_idempotency_key="key-1",
    )
    assert code == 200
    # Use a different idempotency key so we miss the cache and exercise
    # the duplicate path.
    with pytest.raises(CheckinFailure) as exc_info:
        perform_checkin(
            device=a,
            token="raw-token",
            gate="Gate 1",
            scanner_label="Gate 1",
            client_idempotency_key="key-2",
        )
    assert exc_info.value.http_status == 409

    assert not AuditEvent.objects.filter(action="checkin.conflict").exists()
    # The duplicate row is still there:
    assert AuditEvent.objects.filter(action="checkin.duplicate").count() == 1
