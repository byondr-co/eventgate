from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_stats_basic_counts(env):
    c, org, event = env
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="A",
        entry_token="tok-a",
        entry_status="checked_in",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="B",
        entry_token="tok-b",
        entry_status="registered_not_arrived",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="C",
        entry_token="tok-c",
        entry_status="manual_review",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        full_name="D",
        entry_token="tok-d",
        entry_status="displayed",
    )
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        full_name="E",
        entry_token="tok-e",
        entry_status="checked_in",
    )
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="d",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status="open"
    )
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.conflict",
        result="warning",
    )

    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.status_code == 200
    body = r.json()
    assert body["checked_in"] == 2  # one pre-reg + one walk-in
    assert body["registered_not_arrived"] == 1
    assert body["manual_review"] == 1
    assert body["displayed"] == 1
    assert body["total_walkins"] == 2
    assert body["open_escalations"] == 1
    assert body["conflicts_recent_15min"] == 1


def test_stats_recent_conflict_counted(env):
    c, org, event = env
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.conflict",
        result="warning",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.json()["conflicts_recent_15min"] == 1


def test_stats_etag_304(env):
    c, org, event = env
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="A",
        entry_status="checked_in",
    )
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    etag = r1["ETag"]
    r2 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/", HTTP_IF_NONE_MATCH=etag)
    assert r2.status_code == 304


def test_stats_anonymous_forbidden(env):
    _, org, event = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.status_code in (401, 403)
