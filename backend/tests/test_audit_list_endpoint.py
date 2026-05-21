from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
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


def test_list_returns_event_scoped_audits(env):
    c, org, event = env
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.success",
        result="success",
    )
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.duplicate",
        result="warning",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2


def test_list_filter_by_action_prefix(env):
    c, org, event = env
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.success",
        result="success",
    )
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="walkin.claim",
        result="success",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/?action_prefix=checkin.")
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0]["action"] == "checkin.success"


def test_list_excludes_other_events(env):
    c, org, event = env
    other = Event.objects.create(organization=org, name="Other", slug="other")
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.success",
        result="success",
    )
    write_audit(
        organization=org,
        event=other,
        actor_type="system",
        actor_id="s",
        action="checkin.success",
        result="success",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert len(r.json()["results"]) == 1


def test_list_anonymous_forbidden(env):
    _, org, event = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert r.status_code in (401, 403)


def test_list_etag(env):
    c, org, event = env
    write_audit(
        organization=org,
        event=event,
        actor_type="system",
        actor_id="s",
        action="checkin.success",
        result="success",
    )
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    etag = r1["ETag"]
    r2 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/", HTTP_IF_NONE_MATCH=etag)
    assert r2.status_code == 304
