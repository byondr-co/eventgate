"""Scanner escalation endpoint — emits a help_desk_escalation audit row."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.common.tokens import hash_token
from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization


@pytest.fixture
def session(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate 1",
        role="scanner",
        device_token_hash=hash_token("dt"),
    )
    raw = "sess-raw"
    EventPinSession.objects.create(
        event=event,
        scanner_device=device,
        session_token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(hours=8),
    )
    return org, event, device, raw


@pytest.mark.django_db
def test_escalation_writes_audit_row(client, session):
    org, event, device, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={
            "token": "raw-token-x",
            "reason": "scanner_offline_conflict",
            "original_payload": {"gate": "Gate 1", "scanner_label": "Gate 1"},
            "conflict_payload": {"gate": "Gate 2", "scanner_label": "Gate 2"},
        },
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 201
    audit = AuditEvent.objects.filter(action="checkin.help_desk_escalation").first()
    assert audit is not None
    assert audit.event_id == event.id
    assert audit.actor_type == "scanner_device"
    assert audit.actor_id == str(device.id)
    assert audit.result == "warning"
    assert audit.entry_token == "raw-token-x"
    details = audit.details_json
    assert details["reason"] == "scanner_offline_conflict"
    assert details["original_payload"]["gate"] == "Gate 1"
    assert details["conflict_payload"]["gate"] == "Gate 2"


@pytest.mark.django_db
def test_escalation_rejects_without_session(client, session):
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"token": "x", "reason": "y"},
        content_type="application/json",
    )
    assert res.status_code == 401


@pytest.mark.django_db
def test_escalation_rejects_missing_token(client, session):
    *_, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"reason": "scanner_offline_conflict"},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 400
    assert "token" in res.json()["detail"].lower()


@pytest.mark.django_db
def test_escalation_creates_open_ticket_state(client, session):
    org, event, device, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"token": "raw-token-y", "reason": "manual"},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 201, res.content
    audit_id = res.json()["escalation_id"]
    state = HelpDeskTicketState.objects.get(audit_event_id=audit_id)
    assert state.claim_status == "open"
    assert state.organization_id == org.id
    assert state.event_id == event.id
