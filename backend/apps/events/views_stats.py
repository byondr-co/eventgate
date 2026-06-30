"""GET /api/v1/orgs/<slug>/events/<event>/stats/ - live dashboard snapshot.

ETag/304 remains for polling fallback. The body keeps the original top-level
count fields and adds analytics/recent_activity.
"""

from __future__ import annotations

from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.live_snapshot import build_event_live_snapshot, event_live_etag
from apps.events.models import Event


class EventStatsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        now = timezone.now()
        etag = event_live_etag(event, now=now)
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        resp = Response(build_event_live_snapshot(event, now=now))
        resp["ETag"] = etag
        return resp
