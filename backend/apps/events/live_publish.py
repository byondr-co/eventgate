from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from typing import Any

import redis
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


def event_live_channel(event_id: Any) -> str:
    return f"eventgate:event:{event_id}:live"


def publish_event_changed(*, event_id: Any, reason: str, keys: Iterable[str]) -> None:
    payload = {
        "event_id": str(event_id),
        "reason": reason,
        "keys": list(keys),
    }
    client = redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=settings.REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT,
        socket_timeout=settings.REDIS_PUBLISH_SOCKET_TIMEOUT,
    )
    client.publish(event_live_channel(event_id), json.dumps(payload, separators=(",", ":")))


def safe_publish_event_changed(*, event_id: Any, reason: str, keys: Iterable[str]) -> None:
    try:
        publish_event_changed(event_id=event_id, reason=reason, keys=keys)
    except Exception:
        logger.exception(
            "Failed to publish event live change",
            extra={"event_id": str(event_id), "reason": reason},
        )


def schedule_event_changed(*, event_id: Any, reason: str, keys: tuple[str, ...]) -> None:
    transaction.on_commit(
        lambda: safe_publish_event_changed(event_id=event_id, reason=reason, keys=keys)
    )
