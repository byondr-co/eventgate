"""GET /api/v1/orgs/<slug>/events/<event>/stats/ — counters widget.

Cheap aggregates served behind a 5s ETag/304 poll. The ETag is derived from
the latest mutating timestamp across (guests, audit events, ticket states) so
the dashboard returns 304 when nothing has changed since the last poll.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

from django.db.models import Count, Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditEvent
from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState


class EventStatsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)

        # Guest counts: one query, group by entry_status.
        status_counts = (
            Guest.objects.filter(event=event).values("entry_status").annotate(n=Count("id"))
        )
        bucket = {row["entry_status"]: row["n"] for row in status_counts}

        total_walkins = Guest.objects.filter(event=event, guest_type="walk_in").count()

        open_escalations = HelpDeskTicketState.objects.filter(
            event=event, claim_status__in=("open", "claimed")
        ).count()

        cutoff = timezone.now() - timedelta(minutes=15)
        conflicts_recent = AuditEvent.objects.filter(
            event=event, action="checkin.conflict", occurred_at__gte=cutoff
        ).count()

        # ETag inputs:
        guest_agg = Guest.objects.filter(event=event).aggregate(latest=Max("updated_at"))
        ticket_agg = HelpDeskTicketState.objects.filter(event=event).aggregate(
            latest=Max("updated_at")
        )
        audit_agg = AuditEvent.objects.filter(event=event).aggregate(latest=Max("occurred_at"))
        raw = f"{guest_agg['latest']}-{ticket_agg['latest']}-{audit_agg['latest']}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        body = {
            "checked_in": bucket.get("checked_in", 0),
            "registered_not_arrived": bucket.get("registered_not_arrived", 0),
            "manual_review": bucket.get("manual_review", 0),
            "displayed": bucket.get("displayed", 0),
            "total_walkins": total_walkins,
            "open_escalations": open_escalations,
            "conflicts_recent_15min": conflicts_recent,
            "as_of": timezone.now().isoformat(),
        }
        resp = Response(body)
        resp["ETag"] = etag
        return resp
