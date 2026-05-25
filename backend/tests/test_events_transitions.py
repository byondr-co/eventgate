"""Tests for the event status transition endpoint.

POST /api/v1/orgs/<org_slug>/events/<event_slug>/transition/
Body: {"status": "<target>"}
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def org(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    owner = User.objects.create_user(email="owner@example.com")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(user=owner, organization=org, role="owner")
    return org


@pytest.fixture
def manager_member(org):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    mgr = User.objects.create_user(email="manager@example.com")
    OrganizationMembership.objects.create(user=mgr, organization=org, role="manager")
    return mgr


@pytest.fixture
def staff_member(org):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    staff = User.objects.create_user(email="staff@example.com")
    OrganizationMembership.objects.create(user=staff, organization=org, role="staff")
    return staff


def make_event(org, status="draft"):
    return Event.objects.create(
        organization=org, name="Test Event", slug="test-event", status=status
    )


def transition(client, event, target):
    return client.post(
        f"/api/v1/orgs/{event.organization.slug}/events/{event.slug}/transition/",
        {"status": target},
        format="json",
    )


# ---------------------------------------------------------------------------
# Allowed transitions — should return 200 with updated status
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAllowedTransitions:
    def test_draft_to_open(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "open")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "open"
        event.refresh_from_db()
        assert event.status == "open"

    def test_open_to_draft(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="open")
        resp = transition(client, event, "draft")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "draft"

    def test_open_to_live(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="open")
        resp = transition(client, event, "live")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "live"

    def test_live_to_closed(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="live")
        resp = transition(client, event, "closed")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "closed"

    def test_closed_to_open(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="closed")
        resp = transition(client, event, "open")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "open"

    def test_closed_to_archived(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="closed")
        resp = transition(client, event, "archived")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "archived"

    def test_manager_can_transition(self, org, manager_member):
        client = APIClient()
        _login(client, "manager@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "open")
        assert resp.status_code == 200, resp.json()


# ---------------------------------------------------------------------------
# Forbidden transitions — should return 400
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestForbiddenTransitions:
    def test_draft_to_live_skips_open(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "live")
        assert resp.status_code == 400

    def test_draft_to_closed(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "closed")
        assert resp.status_code == 400

    def test_draft_to_archived(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "archived")
        assert resp.status_code == 400

    def test_open_to_closed(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="open")
        resp = transition(client, event, "closed")
        assert resp.status_code == 400

    def test_open_to_archived(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="open")
        resp = transition(client, event, "archived")
        assert resp.status_code == 400

    def test_live_to_draft(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="live")
        resp = transition(client, event, "draft")
        assert resp.status_code == 400

    def test_live_to_open(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="live")
        resp = transition(client, event, "open")
        assert resp.status_code == 400

    def test_live_to_archived(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="live")
        resp = transition(client, event, "archived")
        assert resp.status_code == 400

    def test_archived_to_anything_returns_400(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        for target in ("draft", "open", "live", "closed"):
            event = make_event(org, status="archived")
            event.slug = f"archived-to-{target}"
            event.save(update_fields=["slug"])
            resp = transition(client, event, target)
            assert resp.status_code == 400, f"archived → {target} should be 400"

    def test_same_status_returns_400_with_message(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="open")
        resp = transition(client, event, "open")
        assert resp.status_code == 400
        body = resp.json()
        # Should have a clear error message (not a generic 400)
        assert "detail" in body or "status" in body

    def test_unknown_status_returns_400(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "bogus_status")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Permission tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTransitionPermissions:
    def test_non_member_gets_404(self, org):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        User.objects.create_user(email="outsider@example.com")
        client = APIClient()
        _login(client, "outsider@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "open")
        assert resp.status_code == 404

    def test_staff_member_gets_403(self, org, staff_member):
        client = APIClient()
        _login(client, "staff@example.com")
        event = make_event(org, status="draft")
        resp = transition(client, event, "open")
        assert resp.status_code == 403

    def test_unauthenticated_gets_403(self, org):
        client = APIClient()
        event = make_event(org, status="draft")
        resp = transition(client, event, "open")
        assert resp.status_code in (401, 403)

    def test_404_if_event_does_not_exist(self, org):
        client = APIClient()
        _login(client, "owner@example.com")
        resp = client.post(
            "/api/v1/orgs/acme/events/nonexistent-event/transition/",
            {"status": "open"},
            format="json",
        )
        assert resp.status_code == 404
