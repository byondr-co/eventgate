import logging

import pytest
from django.db import transaction

from apps.events.live_publish import (
    event_live_channel,
    publish_event_changed,
    safe_publish_event_changed,
    schedule_event_changed,
)


def test_event_live_channel_scopes_by_event_id():
    assert event_live_channel("evt-1") == "eventgate:event:evt-1:live"


def test_publish_event_changed_publishes_json(monkeypatch, settings):
    calls = []
    settings.REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT = 0.25
    settings.REDIS_PUBLISH_SOCKET_TIMEOUT = 0.75

    class FakeRedis:
        def publish(self, channel, payload):
            calls.append((channel, payload))
            return 1

    class FakeRedisFactory:
        @staticmethod
        def from_url(url, *, decode_responses, socket_connect_timeout, socket_timeout):
            assert url == settings.REDIS_URL
            assert decode_responses is True
            assert socket_connect_timeout == settings.REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT
            assert socket_timeout == settings.REDIS_PUBLISH_SOCKET_TIMEOUT
            return FakeRedis()

    monkeypatch.setattr("apps.events.live_publish.redis.Redis", FakeRedisFactory)

    publish_event_changed(event_id="evt-1", reason="checkin.success", keys=("stats", "audit"))

    assert calls == [
        (
            "eventgate:event:evt-1:live",
            '{"event_id":"evt-1","reason":"checkin.success","keys":["stats","audit"]}',
        )
    ]


def test_safe_publish_event_changed_suppresses_and_logs_failures(monkeypatch, caplog):
    def raise_publish(**kwargs):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr("apps.events.live_publish.publish_event_changed", raise_publish)

    with caplog.at_level(logging.ERROR, logger="apps.events.live_publish"):
        safe_publish_event_changed(event_id="evt-1", reason="guest.updated", keys=("stats",))

    assert "Failed to publish event live change" in caplog.text
    assert any(record.exc_info for record in caplog.records)


@pytest.mark.django_db(transaction=True)
def test_schedule_event_changed_runs_after_commit(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "apps.events.live_publish.safe_publish_event_changed",
        lambda **kwargs: calls.append(kwargs),
    )

    with transaction.atomic():
        schedule_event_changed(event_id="evt-2", reason="guest.updated", keys=("stats",))
        assert calls == []

    assert calls == [{"event_id": "evt-2", "reason": "guest.updated", "keys": ("stats",)}]


@pytest.mark.django_db(transaction=True)
def test_schedule_event_changed_suppresses_publish_after_rollback(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "apps.events.live_publish.safe_publish_event_changed",
        lambda **kwargs: calls.append(kwargs),
    )

    with pytest.raises(RuntimeError, match="rollback"):
        with transaction.atomic():
            schedule_event_changed(event_id="evt-3", reason="guest.deleted", keys=("stats",))
            raise RuntimeError("rollback")

    assert calls == []
