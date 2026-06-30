from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Any

import redis.asyncio as redis_async
from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import Http404, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from apps.accounts.authentication import CookieJWTAuthentication
from apps.events.live_publish import event_live_channel
from apps.events.live_snapshot import build_event_live_snapshot, event_live_etag
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


def format_sse(event: str, data: dict[str, Any], *, event_id: str | None = None) -> str:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, separators=(",", ":"), default=str)
    for line in payload.splitlines() or [""]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def _resolve_live_event(request, *, org_slug: str, event_slug: str) -> Event:
    auth = CookieJWTAuthentication().authenticate(Request(request))
    if auth is None:
        raise AuthenticationFailed("Authentication credentials were not provided.")
    user, _token = auth

    org = get_object_or_404(Organization, slug=org_slug)
    if not OrganizationMembership.objects.filter(
        organization=org, user=user, is_active=True
    ).exists():
        raise Http404
    return get_object_or_404(Event, organization=org, slug=event_slug)


def _snapshot_for_event_id(event_id: Any) -> tuple[dict[str, Any], str]:
    event = Event.objects.get(id=event_id)
    now = timezone.now()
    return build_event_live_snapshot(event, now=now), event_live_etag(event, now=now)


async def _stream_event(event_id: Any) -> AsyncIterator[str]:
    client = redis_async.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=settings.REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT,
        socket_timeout=settings.REDIS_PUBLISH_SOCKET_TIMEOUT,
    )
    pubsub: Any | None = None
    channel = event_live_channel(event_id)
    subscribed = False
    try:
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        subscribed = True

        snapshot, etag = await sync_to_async(_snapshot_for_event_id)(event_id)
        yield format_sse("snapshot", snapshot, event_id=etag)

        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=25.0)
            if msg is None:
                yield format_sse("heartbeat", {"as_of": timezone.now().isoformat()})
                continue
            try:
                payload = json.loads(msg.get("data") or "{}")
            except json.JSONDecodeError:
                payload = {"event_id": str(event_id), "reason": "unknown", "keys": ["stats"]}
            yield format_sse("invalidate", payload)
            snapshot, etag = await sync_to_async(_snapshot_for_event_id)(event_id)
            yield format_sse("snapshot", snapshot, event_id=etag)
    finally:
        if pubsub is not None:
            if subscribed:
                with suppress(Exception):
                    await pubsub.unsubscribe(channel)
            with suppress(Exception):
                await pubsub.close()
        with suppress(Exception):
            await client.aclose()


async def EventLiveView(request, org_slug: str, event_slug: str):
    try:
        event = await sync_to_async(_resolve_live_event)(
            request, org_slug=org_slug, event_slug=event_slug
        )
    except AuthenticationFailed as exc:
        return JsonResponse({"detail": str(exc)}, status=401)

    response = StreamingHttpResponse(_stream_event(event.id), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
