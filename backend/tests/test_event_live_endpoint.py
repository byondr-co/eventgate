import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.events import views_live
from apps.events.models import Event
from apps.events.views_live import format_sse
from apps.orgs.models import Organization, OrganizationMembership


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


class FakePubSub:
    def __init__(
        self,
        actions,
        messages=None,
        *,
        subscribe_error=None,
        unsubscribe_error=None,
    ):
        self.actions = actions
        self.messages = list(messages or [])
        self.subscribe_error = subscribe_error
        self.unsubscribe_error = unsubscribe_error

    async def subscribe(self, channel):
        self.actions.append(("subscribe", channel))
        if self.subscribe_error is not None:
            raise self.subscribe_error

    async def get_message(self, *, ignore_subscribe_messages, timeout):
        self.actions.append(("get_message", ignore_subscribe_messages, timeout))
        if self.messages:
            return self.messages.pop(0)
        return None

    async def unsubscribe(self, channel):
        self.actions.append(("unsubscribe", channel))
        if self.unsubscribe_error is not None:
            raise self.unsubscribe_error

    async def close(self):
        self.actions.append(("pubsub.close",))


class FakeRedisClient:
    def __init__(self, actions, pubsub):
        self.actions = actions
        self._pubsub = pubsub

    def pubsub(self):
        self.actions.append(("pubsub",))
        return self._pubsub

    async def aclose(self):
        self.actions.append(("client.aclose",))


def install_stream_fakes(monkeypatch, messages=None, **pubsub_kwargs):
    actions = []
    pubsub = FakePubSub(actions, messages, **pubsub_kwargs)
    client = FakeRedisClient(actions, pubsub)
    snapshots = []

    def fake_snapshot_for_event_id(event_id):
        snapshots.append(event_id)
        actions.append(("snapshot", event_id, len(snapshots)))
        return {"checked_in": len(snapshots)}, f"etag-{len(snapshots)}"

    def fake_from_url(url, **kwargs):
        actions.append(("from_url", url, kwargs))
        return client

    monkeypatch.setattr(views_live, "_snapshot_for_event_id", fake_snapshot_for_event_id)
    monkeypatch.setattr(views_live.redis_async, "from_url", fake_from_url)
    return actions


async def collect_stream_frames(stream, count):
    try:
        return [await anext(stream) for _ in range(count)]
    finally:
        await stream.aclose()


async def consume_one_frame(stream):
    try:
        return await anext(stream)
    finally:
        await stream.aclose()


def test_format_sse_frames_json_data():
    frame = format_sse("snapshot", {"checked_in": 1}, event_id="abc")
    assert frame.startswith("id: abc\nevent: snapshot\n")
    assert 'data: {"checked_in":1}' in frame
    assert frame.endswith("\n\n")


def test_stream_subscribes_before_initial_snapshot_and_cleans_up(monkeypatch):
    actions = install_stream_fakes(monkeypatch)

    frames = asyncio.run(collect_stream_frames(views_live._stream_event("evt-1"), 1))

    assert frames == [
        'id: etag-1\nevent: snapshot\ndata: {"checked_in":1}\n\n',
    ]
    assert actions[:4] == [
        (
            "from_url",
            settings.REDIS_URL,
            {
                "decode_responses": True,
                "socket_connect_timeout": settings.REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT,
                "socket_timeout": settings.REDIS_PUBLISH_SOCKET_TIMEOUT,
            },
        ),
        ("pubsub",),
        ("subscribe", "eventgate:event:evt-1:live"),
        ("snapshot", "evt-1", 1),
    ]
    assert ("unsubscribe", "eventgate:event:evt-1:live") in actions
    assert ("pubsub.close",) in actions
    assert ("client.aclose",) in actions


def test_stream_emits_invalidate_and_fresh_snapshot_for_message(monkeypatch):
    actions = install_stream_fakes(
        monkeypatch,
        messages=[
            {
                "data": '{"event_id":"evt-1","reason":"checkin.success","keys":["stats"]}',
            }
        ],
    )

    frames = asyncio.run(collect_stream_frames(views_live._stream_event("evt-1"), 3))

    assert frames[0] == 'id: etag-1\nevent: snapshot\ndata: {"checked_in":1}\n\n'
    assert frames[1] == (
        'event: invalidate\ndata: {"event_id":"evt-1",'
        '"reason":"checkin.success","keys":["stats"]}\n\n'
    )
    assert frames[2] == 'id: etag-2\nevent: snapshot\ndata: {"checked_in":2}\n\n'
    assert ("snapshot", "evt-1", 2) in actions


def test_stream_emits_heartbeat_and_fresh_snapshot_when_no_message(monkeypatch):
    install_stream_fakes(monkeypatch)

    frames = asyncio.run(collect_stream_frames(views_live._stream_event("evt-1"), 3))

    assert frames[0].startswith("id: etag-1\nevent: snapshot\n")
    assert frames[1].startswith("event: heartbeat\ndata: {")
    assert frames[2] == 'id: etag-2\nevent: snapshot\ndata: {"checked_in":2}\n\n'


def test_stream_cleans_up_when_subscribe_fails(monkeypatch):
    actions = install_stream_fakes(
        monkeypatch,
        subscribe_error=RuntimeError("subscribe failed"),
    )

    with pytest.raises(RuntimeError, match="subscribe failed"):
        asyncio.run(consume_one_frame(views_live._stream_event("evt-1")))

    assert ("pubsub.close",) in actions
    assert ("client.aclose",) in actions
    assert not any(action[0] == "unsubscribe" for action in actions)


def test_stream_cleans_up_when_unsubscribe_fails(monkeypatch):
    actions = install_stream_fakes(
        monkeypatch,
        unsubscribe_error=RuntimeError("unsubscribe failed"),
    )

    asyncio.run(collect_stream_frames(views_live._stream_event("evt-1"), 1))

    assert ("unsubscribe", "eventgate:event:evt-1:live") in actions
    assert ("pubsub.close",) in actions
    assert ("client.aclose",) in actions


@pytest.mark.django_db
def test_snapshot_for_event_id_uses_one_now_for_snapshot_and_etag(env, monkeypatch):
    _, _, event = env
    now = datetime(2026, 6, 30, 12, 15, tzinfo=UTC)
    seen = {}

    def fake_snapshot(event_arg, *, now=None):
        seen["snapshot"] = (event_arg, now)
        return {"checked_in": 1}

    def fake_etag(event_arg, *, now=None):
        seen["etag"] = (event_arg, now)
        return "etag"

    monkeypatch.setattr(views_live, "timezone", SimpleNamespace(now=lambda: now), raising=False)
    monkeypatch.setattr(views_live, "build_event_live_snapshot", fake_snapshot)
    monkeypatch.setattr(views_live, "event_live_etag", fake_etag)

    assert views_live._snapshot_for_event_id(event.id) == ({"checked_in": 1}, "etag")
    assert seen == {
        "snapshot": (event, now),
        "etag": (event, now),
    }


@pytest.mark.django_db
def test_live_endpoint_requires_auth(env):
    _, org, event = env
    r = APIClient().get(live_url(org, event))
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_live_endpoint_returns_event_stream(env):
    user, org, event = env
    r = auth_client(user).get(live_url(org, event))
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/event-stream")
    assert r["Cache-Control"] == "no-cache"
    assert r["X-Accel-Buffering"] == "no"


@pytest.mark.django_db
def test_live_endpoint_hides_event_from_non_member(env):
    _, org, event = env
    outsider = User.objects.create_user(email="outsider@example.com", password="x")
    r = auth_client(outsider).get(live_url(org, event))
    assert r.status_code == 404
