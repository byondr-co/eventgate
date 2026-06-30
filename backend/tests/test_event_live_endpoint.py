import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.views_live import format_sse
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env():
    user = User.objects.create_user(email="owner@example.com", password="x")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    return user, org, event


def live_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/live/"


def auth_client(user):
    c = APIClient()
    c.cookies[settings.JWT_ACCESS_COOKIE] = str(AccessToken.for_user(user))
    return c


def test_format_sse_frames_json_data():
    frame = format_sse("snapshot", {"checked_in": 1}, event_id="abc")
    assert frame.startswith("id: abc\nevent: snapshot\n")
    assert 'data: {"checked_in":1}' in frame
    assert frame.endswith("\n\n")


def test_live_endpoint_requires_auth(env):
    _, org, event = env
    r = APIClient().get(live_url(org, event))
    assert r.status_code in (401, 403)


def test_live_endpoint_returns_event_stream(env):
    user, org, event = env
    r = auth_client(user).get(live_url(org, event))
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/event-stream")
    assert r["Cache-Control"] == "no-cache"
