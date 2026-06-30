from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.checkins.services import CheckinFailure, perform_checkin
from apps.common.tokens import hash_token
from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState
from apps.helpdesk.services import claim_ticket, release_ticket, resolve_ticket
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = django_user_model.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    device = ScannerDevice.objects.create(
        organization=org,
        event=event,
        label="Gate Device",
        role="scanner",
        device_token_hash="hash",
    )
    return org, user, event, device


def test_checkin_success_schedules_metric_and_live_publish(monkeypatch, env):
    org, _, _, device = env
    guest = Guest.objects.create(
        organization=org,
        event=device.event,
        guest_type="pre_registered",
        entry_token="tok",
        entry_status="registered_not_arrived",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr(
        "apps.checkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr(
        "apps.checkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    perform_checkin(
        device=device,
        token=guest.entry_token,
        gate="North",
        scanner_label="A1",
        client_idempotency_key="idem-1",
    )

    assert metrics[0]["counter"] == "checkins"
    assert metrics[0]["gate"] == "North"
    assert publishes[0]["reason"] == "checkin.success"
    assert "stats" in publishes[0]["keys"]


def test_checkin_duplicate_schedules_duplicate_metric(monkeypatch, env):
    org, _, _, device = env
    guest = Guest.objects.create(
        organization=org,
        event=device.event,
        guest_type="pre_registered",
        entry_token="tok",
        entry_status="checked_in",
        gate="North",
        scanner="A1",
    )
    metrics = []
    monkeypatch.setattr(
        "apps.checkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr("apps.checkins.services.schedule_event_changed", lambda **kw: None)

    with pytest.raises(CheckinFailure):
        perform_checkin(
            device=device,
            token=guest.entry_token,
            gate="North",
            scanner_label="A1",
            client_idempotency_key="idem-2",
        )

    assert metrics[0]["counter"] == "duplicates"


def test_checkin_conflict_schedules_conflict_metric_and_live_publish(monkeypatch, env):
    org, _, _, device = env
    guest = Guest.objects.create(
        organization=org,
        event=device.event,
        guest_type="pre_registered",
        entry_token="tok",
        entry_status="checked_in",
        gate="South",
        scanner="B2",
    )
    metrics = []
    publishes = []
    monkeypatch.setattr(
        "apps.checkins.services.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr(
        "apps.checkins.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    with pytest.raises(CheckinFailure):
        perform_checkin(
            device=device,
            token=guest.entry_token,
            gate="North",
            scanner_label="A1",
            client_idempotency_key="idem-3",
        )

    assert [metric["counter"] for metric in metrics] == ["conflicts", "duplicates"]
    assert [publish["reason"] for publish in publishes] == [
        "checkin.conflict",
        "checkin.duplicate",
    ]


def test_scanner_escalation_schedules_metric_and_live_publish(monkeypatch, client, env):
    _, _, event, device = env
    raw_session_token = "session-token"
    EventPinSession.objects.create(
        event=event,
        scanner_device=device,
        session_token_hash=hash_token(raw_session_token),
        expires_at=timezone.now() + timedelta(hours=8),
    )
    metrics = []
    publishes = []
    monkeypatch.setattr(
        "apps.scanner.views.schedule_metric_increment", lambda **kw: metrics.append(kw)
    )
    monkeypatch.setattr(
        "apps.scanner.views.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    response = client.post(
        reverse("scanner-escalation"),
        data={"token": "raw-token-y", "reason": "manual"},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {raw_session_token}",
    )

    assert response.status_code == 201
    assert metrics[0]["counter"] == "escalations"
    assert metrics[0]["scanner"] == device.label
    assert publishes[0]["reason"] == "checkin.help_desk_escalation"
    assert "helpdesk" in publishes[0]["keys"]


def test_helpdesk_claim_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        organization=org, event=event, audit_event=audit, claim_status="open"
    )
    publishes = []
    monkeypatch.setattr(
        "apps.helpdesk.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    claim_ticket(ticket=ticket, user=user)

    assert publishes[0]["reason"] == "helpdesk.ticket_claimed"
    assert "helpdesk" in publishes[0]["keys"]


def test_helpdesk_release_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        organization=org,
        event=event,
        audit_event=audit,
        claim_status="claimed",
        assigned_to=user,
        claimed_at=timezone.now(),
    )
    publishes = []
    monkeypatch.setattr(
        "apps.helpdesk.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    release_ticket(ticket=ticket, user=user)

    assert publishes[0]["reason"] == "helpdesk.ticket_released"
    assert "helpdesk" in publishes[0]["keys"]


def test_helpdesk_resolve_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        organization=org, event=event, audit_event=audit, claim_status="open"
    )
    publishes = []
    monkeypatch.setattr(
        "apps.helpdesk.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    resolve_ticket(ticket=ticket, user=user, action="approve_checkin", notes="verified")

    assert publishes[0]["reason"] == "helpdesk.ticket_resolved"
    assert "manual_review" in publishes[0]["keys"]


def test_helpdesk_manual_review_escalation_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok-escalate",
        entry_status="registered_not_arrived",
    )
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="device",
        action="checkin.help_desk_escalation",
        result="warning",
        entry_token="tok-escalate",
    )
    ticket = HelpDeskTicketState.objects.create(
        organization=org, event=event, audit_event=audit, claim_status="open"
    )
    publishes = []
    monkeypatch.setattr(
        "apps.helpdesk.services.schedule_event_changed", lambda **kw: publishes.append(kw)
    )

    resolve_ticket(
        ticket=ticket,
        user=user,
        action="escalated_to_manual_review",
        notes="needs review",
    )

    assert [publish["reason"] for publish in publishes] == [
        "helpdesk.manual_review_escalated",
        "helpdesk.ticket_resolved",
    ]
    assert "guests_count" in publishes[0]["keys"]


def test_manual_review_resolve_view_schedules_live_publish(monkeypatch, env):
    org, user, event, _ = env
    guest = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="tok-review",
        entry_status="manual_review",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    publishes = []
    monkeypatch.setattr(
        "apps.helpdesk.views_manual_review.schedule_event_changed",
        lambda **kw: publishes.append(kw),
    )

    response = client.post(
        (
            f"/api/v1/orgs/{org.slug}/events/{event.slug}"
            f"/helpdesk/manual-review/{guest.id}/resolve/"
        ),
        data={"action": "approve_checkin", "notes": "verified"},
        format="json",
    )

    assert response.status_code == 200
    assert publishes[0]["reason"] == "helpdesk.manual_review_resolved"
    assert "guests_count" in publishes[0]["keys"]
